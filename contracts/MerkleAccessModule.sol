// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.9;

import "hardhat/console.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/MerkleProofUpgradeable.sol";
import "@openzeppelin/contracts/interfaces/IERC721.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@gnosis.pm/zodiac/contracts/core/Module.sol";
import "./interfaces/IConfig.sol";
import "./AccessModule.sol";

contract MerkleAccessModule is AccessModule {
    mapping(uint256 => bytes32) public roots;
    using MerkleProofUpgradeable for bytes32[];

    constructor(
        address _owner,
        address _avatar,
        address _target,
        address _config
    ) {
        bytes memory initParams = abi.encode(_owner, _avatar, _target, _config);
        setUp(initParams);
    }

    function setUp(bytes memory initParams) public override initializer {
        (
            address _owner,
            address _avatar,
            address _target,
            address _config
        ) = abi.decode(initParams, (address, address, address, address));
        __Ownable_init();
        require(_avatar != address(0), "Avatar can not be zero address");
        require(_target != address(0), "Target can not be zero address");

        avatar = _avatar;
        target = _target;
        config = _config;

        transferOwnership(_owner);
    }

    function setRoot(uint256 rootId, bytes32 root) external onlyAvatar {
        require(roots[rootId] == bytes32(0), "root already set");
        roots[rootId] = root;
    }

    function inMerkleTree(
        uint256 merkleRootId,
        bytes memory leaf,
        bytes32[] memory proof
    ) public view returns (bool) {
        return proof.verify(roots[merkleRootId], keccak256(leaf));
    }

    function merkleExecute(
        bytes memory leaf,
        bytes32[] memory proof,
        bytes memory extraData
    ) public {
        // verify in tree
        (
            ,
            bytes4 formats,
            uint256 merkleRootId,
            bytes memory validityData,
            bytes memory userData,
            bytes memory actionData
        ) = abi.decode(leaf, (address, bytes4, uint256, bytes, bytes, bytes));
        bytes32 leafHash = keccak256(leaf);
        require(formats[0] == hex"01", "invalid format");
        // Check in tree
        require(inMerkleTree(merkleRootId, leaf, proof), "not in merkle tree");
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
