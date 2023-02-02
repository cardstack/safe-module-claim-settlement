// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/interfaces/IERC721.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@gnosis.pm/zodiac/contracts/core/Module.sol";
import "./interfaces/IConfig.sol";
import "./AccessModule.sol";

contract SignedAccessModule is AccessModule {
    address public keySigner;

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
        keySigner = _owner;
        avatar = _avatar;
        target = _target;
        config = _config;

        transferOwnership(_owner);
    }

    function isSigned(
        uint8 v,
        bytes32 r,
        bytes32 s,
        bytes32 hash
    ) public view returns (bool) {
        bytes memory prefix = "\x19Ethereum Signed Message:\n32";
        bytes32 prefixedHashMessage = keccak256(abi.encodePacked(prefix, hash));
        address signer = ecrecover(prefixedHashMessage, v, r, s);
        return signer == keySigner;
    }

    function signedExecute(
        uint8 v,
        bytes32 r,
        bytes32 s,
        bytes memory leaf,
        bytes memory extraData
    ) public {
        // verify in tree
        (
            address module,
            bytes4 formats,
            bytes memory validityData,
            bytes memory userData,
            bytes memory actionData
        ) = abi.decode(leaf, (address, bytes4, bytes, bytes, bytes));
        require(module == address(this), "invalid module");
        bytes32 leafHash = keccak256(leaf);
        require(formats[0] == hex"01", "invalid format");
        // Check it's signed
        require(isSigned(v, r, s, leafHash), "invalid signature");
        // Check valid time/etc
        require(isValid(formats[1], validityData, leafHash), "invalid leaf");
        // Check user is allowed to call this
        require(isValidUser(formats[2], userData), "invalid caller");
        // Execute action
        require(
            executeAction(formats[3], actionData, extraData),
            "action failed"
        );
        // Mark as used, if applicable
        if (formats[1] == hex"01") {
            used[leafHash] = true;
        }
        // emit event
    }
}
