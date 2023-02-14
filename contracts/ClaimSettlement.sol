// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@gnosis.pm/zodiac/contracts/core/Module.sol";
import "./ClaimSettlementBase.sol";

contract ClaimSettlement is ClaimSettlementBase {
    address public keySigner;

    constructor(address _owner, address _avatar, address _target) {
        bytes memory initParams = abi.encode(_owner, _avatar, _target);
        setUp(initParams);
        domain = EIP712Domain({
            name: "CardstackClaimSettlementModule",
            version: "1", // potentially this should be either the module or safe address
            chainId: block.chainid, // Set to real chain ID
            verifyingContract: address(this) // Potentially this should be the safe address?
        });
        domainSeparator = hash(domain);
    }

    function hash(
        EIP712Domain memory eip712Domain
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    EIP712DOMAIN_TYPEHASH,
                    keccak256(bytes(eip712Domain.name)),
                    keccak256(bytes(eip712Domain.version)),
                    eip712Domain.chainId,
                    eip712Domain.verifyingContract
                )
            );
    }

    function setUp(bytes memory initParams) public override initializer {
        (address _owner, address _avatar, address _target) = abi.decode(
            initParams,
            (address, address, address)
        );
        __Ownable_init();
        require(_avatar != address(0), "Avatar can not be zero address");
        require(_target != address(0), "Target can not be zero address");
        keySigner = _owner;
        avatar = _avatar;
        target = _target;

        transferOwnership(_owner);
    }

    function signedExecute(
        bytes calldata signature,
        bytes calldata everything
    ) public {
        // Check it's signed
        bytes32 digest = executeAndCreateDigest(everything);

        // Check signed at the end
        require(
            keySigner == ECDSA.recover(digest, signature),
            "Invalid signature"
        );
        // emit event
    }
}
