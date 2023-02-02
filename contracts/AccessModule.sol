// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/interfaces/IERC721.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@gnosis.pm/zodiac/contracts/core/Module.sol";

abstract contract AccessModule is Module {
    mapping(bytes32 => bool) public used; // "claim" terminology not always appropriate, but this is a record of whether a claim has been used

    modifier onlyAvatar() {
        require(msg.sender == avatar, "caller is not the right avatar");
        _;
    }

    // Passing in the leaf hash feels like a leaky abstraction
    // We can instead pass in just the leaf and redo the abi decoding
    // The abi decoding for the single test costs roughly 3k gas
    function isValid(
        bytes1 format,
        bytes memory validityData,
        bytes32 leafHash
    ) public view returns (bool) {
        if (format == hex"00") {
            return true;
        }
        if (format == hex"01") {
            if (used[leafHash]) {
                return false;
            }
            (address safeAddress, uint256 validFrom, uint256 validTo) = abi
                .decode(validityData, (address, uint256, uint256));
            return
                validFrom <= block.timestamp &&
                block.timestamp < validTo && //note: https://ethereum.stackexchange.com/questions/413/can-a-contract-safely-rely-on-block-timestamp
                safeAddress == target;
        }
        return false;
    }

    function isValidUser(
        bytes1 format,
        bytes memory userData
    ) public view returns (bool) {
        if (format == hex"00") {
            return true;
        }
        if (format == hex"01") {
            address caller = abi.decode(userData, (address));
            return caller == msg.sender;
        }
        if (format == hex"02") {
            (address contractAddress, uint256 tokenId) = abi.decode(
                userData,
                (address, uint256)
            );
            return IERC721(contractAddress).ownerOf(tokenId) == msg.sender;
        }
        return false;
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
        require(execTxStatus, "execTx failed");
        return true;
    }

    function transferERC721(
        address tokenAddress,
        address to,
        uint256 tokenId
    ) internal returns (bool) {
        console.log("solidity");
        console.log(msg.sender);
        bytes memory execTxData = abi.encodeWithSelector(
            0x23b872dd,
            avatar,
            to,
            tokenId
        );
        return exec(tokenAddress, 0, execTxData, Enum.Operation.Call);
    }

    // Security Q - How do we prevent a malicious user from calling this function?
    // Is internal enough?
    function executeAction(
        bytes1 format,
        bytes memory actionData,
        bytes memory extraData
    ) internal returns (bool) {
        if (format == hex"01") {
            uint256 amount = abi.decode(actionData, (uint256));
            address payable transferTo = abi.decode(extraData, (address));
            return exec(transferTo, amount, bytes("0x"), Enum.Operation.Call);
        }
        if (format == hex"02") {
            (uint256 amount, address payable transferTo) = abi.decode(
                actionData,
                (uint256, address)
            );
            return exec(transferTo, amount, bytes("0x"), Enum.Operation.Call);
        }
        if (format == hex"03") {
            (address tokenAddress, uint256 amount) = abi.decode(
                actionData,
                (address, uint256)
            );
            address payable transferTo = abi.decode(extraData, (address));
            // Security Q - Is this safe?
            return transferERC20(tokenAddress, transferTo, amount);
        }
        if (format == hex"04") {
            (
                address tokenAddress,
                uint256 amount,
                address payable transferTo
            ) = abi.decode(actionData, (address, uint256, address));
            // Security Q - Is this safe?
            return transferERC20(tokenAddress, transferTo, amount);
        }
        if (format == hex"05") {
            (address tokenAddress, address transferTo, uint256 tokenId) = abi
                .decode(actionData, (address, address, uint256));
            return transferERC721(tokenAddress, transferTo, tokenId);
        }
        return false;
    }
}
