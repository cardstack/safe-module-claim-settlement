// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/interfaces/IERC721.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@gnosis.pm/zodiac/contracts/core/Module.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

abstract contract ClaimSettlementBase is Module {
    mapping(bytes32 => bool) public used; // "claim" terminology not always appropriate, but this is a record of whether a claim has been used

    bytes32 public domainSeparator;
    EIP712Domain public domain;

    struct EIP712Domain {
        string name;
        string version;
        uint256 chainId;
        address verifyingContract;
    }

    bytes32 public constant EIP712DOMAIN_TYPEHASH =
        keccak256(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );

    struct None {
        bool empty;
    }

    // State conditions

    bytes32 public constant NONE_TYPEHASH = keccak256("None(bool empty)");

    struct TimeRangeSeconds {
        uint256 validFromTime;
        uint256 validToTime;
    }

    bytes32 public constant TIMERANGESECONDS_TYPEHASH =
        keccak256(
            "TimeRangeSeconds(uint256 validFromTime,uint256 validToTime)"
        );

    struct TimeRangeBlocks {
        uint256 validFromBlock;
        uint256 validToBlock;
    }

    bytes32 public constant TIMERANGEBLOCKS_TYPEHASH =
        keccak256(
            "TimeRangeBlocks(uint256 validFromBlock,uint256 validToBlock)"
        );

    // Caller conditions
    struct Address {
        address caller;
    }

    bytes32 public constant ADDRESS_TYPEHASH =
        keccak256("Address(address caller)");

    struct NFTOwner {
        address nftContract;
        uint256 tokenId;
    }

    bytes32 public constant NFTOWNER_TYPEHASH =
        keccak256("NFTOwner(address nftContract,uint256 tokenId)");

    // Actions

    struct TransferERC20ToCaller {
        address token;
        uint256 amount;
    }

    bytes32 public constant TRANSFERERC20TOCALLER_TYPEHASH =
        keccak256("TransferERC20ToCaller(address token,uint256 amount)");

    struct TransferNFTToCaller {
        address token;
        uint256 tokenId;
    }

    bytes32 public constant TRANSFERNFTTOCALLER_TYPEHASH =
        keccak256("TransferNFTToCaller(address token,uint256 tokenId)");

    modifier onlyAvatar() {
        require(_msgSender() == avatar, "caller is not the right avatar");
        _;
    }

    function isValidState(
        bytes32 typehash,
        bytes memory validityData
    ) public view returns (bool) {
        // Instead of using the format number approach, use the typehash of the struct to
        // decode into. This puts some semantic meaning into the structs, which is exposed
        // to users
        if (typehash == NONE_TYPEHASH) {
            return true;
        }
        if (typehash == TIMERANGESECONDS_TYPEHASH) {
            TimeRangeSeconds memory check = abi.decode(
                validityData,
                (TimeRangeSeconds)
            );
            if (
                check.validFromTime <= block.timestamp && // for these use cases, I don't think there's an issue with miners manipulating the block time
                block.timestamp < check.validToTime
            ) {
                return true;
            } else {
                return false;
            }
        }
        revert("State check not supported");
    }

    function isValidCaller(
        address caller,
        bytes32 typehash,
        bytes memory callerData
    ) public view returns (bool) {
        // Instead of using the format number approach, use the typehash of the struct to
        // decode into.
        if (typehash == NONE_TYPEHASH) {
            return true;
        }
        if (typehash == ADDRESS_TYPEHASH) {
            Address memory check = abi.decode(callerData, (Address));
            if (check.caller == caller) {
                return true;
            } else {
                return false;
            }
        }
        if (typehash == NFTOWNER_TYPEHASH) {
            NFTOwner memory check = abi.decode(callerData, (NFTOwner));
            if (IERC721(check.nftContract).ownerOf(check.tokenId) == caller) {
                return true;
            } else {
                return false;
            }
        }
        revert("Caller check not supported");
    }

    function transferERC20(
        address token,
        address to,
        uint256 amount
    ) internal returns (bool) {
        bytes memory execTxData = abi.encodeWithSelector(
            0xa9059cbb, //method id: transfer(address _to, uint256 _value)
            to,
            amount
        );
        bool execTxStatus = exec(token, 0, execTxData, Enum.Operation.Call);
        require(execTxStatus, "ERC20 transfer failed");
        return true;
    }

    function transferERC721(
        address tokenAddress,
        address to,
        uint256 tokenId
    ) internal returns (bool) {
        bytes memory execTxData = abi.encodeWithSelector(
            0x23b872dd, //method id: transferFrom(address _from, address _to, uint256 _tokenId)
            avatar,
            to,
            tokenId
        );
        bool execTxStatus = exec(
            tokenAddress,
            0,
            execTxData,
            Enum.Operation.Call
        );
        require(execTxStatus, "ERC721 transfer failed");
        return true;
    }

    function executeAction(
        bytes32 typehash,
        bytes memory actionData,
        bytes memory extraData
    ) internal returns (bool) {
        if (typehash == TRANSFERERC20TOCALLER_TYPEHASH) {
            TransferERC20ToCaller memory action = abi.decode(
                actionData,
                (TransferERC20ToCaller)
            );

            uint256 minimumTokens = abi.decode(extraData, (uint256));
            uint256 currentBalance = IERC20(action.token).balanceOf(avatar);
            require(
                currentBalance >= minimumTokens,
                "Not enough tokens to transfer"
            );
            return
                transferERC20(
                    action.token,
                    _msgSender(),
                    Math.min(action.amount, currentBalance)
                );
        }
        if (typehash == TRANSFERNFTTOCALLER_TYPEHASH) {
            TransferNFTToCaller memory action = abi.decode(
                actionData,
                (TransferNFTToCaller)
            );
            return transferERC721(action.token, _msgSender(), action.tokenId);
        }
        revert("Action not supported");
    }

    function createDigest(
        bytes32 typehash,
        bytes32 id,
        bytes32 validHash,
        bytes32 callerHash,
        bytes32 actionHash
    ) internal view returns (bytes32) {
        // Note: we need to use `encodePacked` here instead of `encode`.
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                domainSeparator,
                keccak256(
                    abi.encode(typehash, id, validHash, callerHash, actionHash)
                )
            )
        );
        return digest;
    }

    // Not really liking cramming everything into one arg however I hit the
    // limits of the stack when trying to pass in all the arguments individually
    function executeAndCreateDigest(
        bytes calldata executionData
    ) internal returns (bytes32) {
        (
            bytes32 rootTypehash,
            bytes32 id,
            bytes32 validityTypehash,
            bytes memory validityData,
            bytes32 callerTypehash,
            bytes memory callerData,
            bytes32 actionTypehash,
            bytes memory actionData,
            bytes memory extraData
        ) = abi.decode(
                executionData,
                (
                    bytes32,
                    bytes32,
                    bytes32,
                    bytes,
                    bytes32,
                    bytes,
                    bytes32,
                    bytes,
                    bytes
                )
            );

        // IDs are single use
        require(used[id] == false, "Already claimed");
        used[id] = true;

        // Check requirements like safe address, valid time ranges, etc
        require(isValidState(validityTypehash, validityData), "Invalid state");

        // Check caller is allowed to perform the action
        require(
            isValidCaller(_msgSender(), callerTypehash, callerData),
            "Caller cannot claim"
        );

        // Execute action
        require(
            executeAction(actionTypehash, actionData, extraData),
            "Action failed"
        );
        return
            createDigest(
                rootTypehash,
                id,
                keccak256(bytes.concat(validityTypehash, validityData)),
                keccak256(bytes.concat(callerTypehash, callerData)),
                keccak256(bytes.concat(actionTypehash, actionData))
            );
    }
}
