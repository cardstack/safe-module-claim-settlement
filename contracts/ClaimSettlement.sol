// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@gnosis.pm/zodiac/contracts/core/Module.sol";
import "./ClaimSettlementBase.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract ClaimSettlement is ClaimSettlementBase {
    using EnumerableSet for EnumerableSet.AddressSet;

    EnumerableSet.AddressSet private validators;

    event ClaimSettlementSetup(
        address indexed initiator,
        address indexed owner,
        address indexed avatar,
        address moduleAddress
    );
    event ValidatorAdded(address validator);
    event ValidatorRemoved(address validator);
    event Claimed(bytes32 indexed id, bytes32 indexed digest, bytes fullData);

    constructor(address _owner, address _avatar, address _target) {
        bytes memory initParams = abi.encode(_owner, _avatar, _target);
        setUp(initParams);
    }

    function getValidators() external view returns (address[] memory) {
        return validators.values();
    }

    function isValidator(address validator) external view returns (bool) {
        return validators.contains(validator);
    }

    function addValidator(address validator) external onlyAvatar {
        validators.add(validator);
        emit ValidatorAdded(validator);
    }

    function removeValidator(address validator) external onlyAvatar {
        validators.remove(validator);
        emit ValidatorRemoved(validator);
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
        domain = EIP712Domain({
            name: "CardstackClaimSettlementModule",
            version: "1", // potentially this should be either the module or safe address
            chainId: block.chainid, // Set to real chain ID
            verifyingContract: address(this) // Potentially this should be the safe address?
        });
        domainSeparator = hash(domain);
        (address _owner, address _avatar, address _target) = abi.decode(
            initParams,
            (address, address, address)
        );
        __Ownable_init();
        require(_avatar != address(0), "Avatar can not be zero address");
        require(_target != address(0), "Target can not be zero address");
        avatar = _avatar;
        target = _target;

        transferOwnership(_owner);

        emit ClaimSettlementSetup(_msgSender(), _owner, _avatar, address(this));
    }

    function signedExecute(
        bytes calldata signature,
        bytes calldata fullData
    ) public {
        (bytes32 digest, bytes32 id) = executeAndCreateDigest(fullData);

        address signer = ECDSA.recover(digest, signature);
        require(validators.contains(signer), "Invalid signature");
        emit Claimed(id, digest, fullData);
    }
}
