// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.9;

import "hardhat/console.sol";
import "@openzeppelin/contracts/interfaces/IERC721.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@gnosis.pm/zodiac/contracts/core/Module.sol";
import "./AccessModule.sol";

contract ConsensusSignedAccessModule is AccessModule {
    address public stakingContract;
    uint256 public threshold = 1000; // This shouldn't be hard coded but this is just an example

    constructor(
        address _owner,
        address _avatar,
        address _target,
        address _stakingContract
    ) {
        bytes memory initParams = abi.encode(
            _owner,
            _avatar,
            _target,
            _stakingContract
        );
        setUp(initParams);
    }

    function setUp(bytes memory initParams) public override initializer {
        (
            address _owner,
            address _avatar,
            address _target,
            address _stakingContract
        ) = abi.decode(initParams, (address, address, address, address));
        __Ownable_init();
        require(_avatar != address(0), "Avatar can not be zero address");
        require(_target != address(0), "Target can not be zero address");
        avatar = _avatar;
        target = _target;
        stakingContract = _stakingContract;

        transferOwnership(_owner);
    }

    function isSigned(
        bytes32 hash,
        bytes[] memory signatures
    ) public view returns (bool) {
        uint256 staked = 0;
        bytes memory prefix = "\x19Ethereum Signed Message:\n32";
        bytes32 prefixedHashMessage = keccak256(abi.encodePacked(prefix, hash));
        for (uint i = 0; i < signatures.length; i++) {
            (uint8 v, bytes32 r, bytes32 s) = abi.decode(
                signatures[i],
                (uint8, bytes32, bytes32)
            );
            address signer = ecrecover(prefixedHashMessage, v, r, s);
            if (signer != address(0)) {
                staked += IERC20(stakingContract).balanceOf(signer);
            }
        }
        return staked >= threshold;
    }

    function consensusExecute(
        bytes[] memory signatures,
        bytes memory leaf,
        bytes memory extraData
    ) public {
        // verify in tree
        (
            ,
            bytes4 formats,
            bytes memory validityData,
            bytes memory userData,
            bytes memory actionData
        ) = abi.decode(leaf, (address, bytes4, bytes, bytes, bytes));
        bytes32 leafHash = keccak256(leaf);
        require(formats[0] == hex"01", "invalid format");
        // Check it is signed by enough signers with enough staked
        require(isSigned(leafHash, signatures), "not backed by enough signers");
        // Check valid time/etc
        require(isValid(formats[1], validityData, leafHash), "not valid");
        // Check user is allowed to call this
        require(isValidUser(formats[2], userData), "caller cannot claim");
        // Execute action
        require(
            executeAction(formats[3], actionData, extraData),
            "Action failed"
        );
        // Mark as used, if applicable
        if (formats[1] == hex"01") {
            used[leafHash] = true;
        }
        // emit event
    }
}
