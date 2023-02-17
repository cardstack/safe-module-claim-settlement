# Claim Settlement Module

This module allows one of a set of addresses (called validators) to sign claims that a caller can use to receive tokens (ERC20 and ERC721) from a safe. Owners of the safe can add and remove validators.

Signing claims does not cost any gas, instead the caller must pay for the gas to perform the transfer.

Transfers can be conditional on the caller being a specific address, or on the caller holding a specific NFT and they can also be time limited.

## Features

- Add and remove validators
- Disburse tokens to the holder of a specific NFT
- Disburse tokens to a specific address
- Uniform gas costs regardless of scale
- No gas costs for validators to sign claims

## Claim structure

All claims have a unique ID, a user check, a state check and an action.

### ID

An ID may be claimed only once, and is a 32 byte value. It is the responsibility of the validator to ensure that the ID is unique unless only one of a set of claims should be allowed (e.g. optionally claiming an amount in USDC or WETH). The ID is used to prevent replay attacks.

### State checks

A state check are used to ensure that the claim is valid at the time it is executed. They are optional, and if present must be true for the claim to be executed.

There are two types of state check, time range and block range.

    TimeRangeBlocks(uint256 validFromBlock,uint256 validToBlock)

The claim is valid if `validFromBlock <= block.number < validToBlock`.

    TimeRangeTimestamps(uint256 validFromTimestamp,uint256 validToTimestamp)

The claim is valid if `validFromTimestamp <= block.timestamp < validToTimestamp`, where the timestamps are seconds since the Unix epoch.

### User checks

A user check is used to ensure that the claim is valid for the user who is executing it. They are optional, and if present must be true for the action to be taken.

    Address(address caller)

The claim can be made if the caller is the specified address only.

    NFTOwner(address nftContract,uint256 tokenId)

The claim can be made if the caller is then owner of the specified NFT.

### Actions

If the checks are satisfied, the claim will execute one of the following actions:

    TransferERC20ToCaller(address token,uint256 amount)

Transfer `amount` of `token` from the safe to the caller. The caller should be validated by the user check.

    TransferERC721ToCaller(address token,uint256 tokenId)

Transfer `tokenId` of `token` from the safe to the caller. The caller should be validated by the user check as with ERC20 transfers.

## Flow

Module owner adds validators.

Validators format and sign a claim, by formatting the the claim into a type called `Claim` and then creating a signature of the typed data. The Cardstack SDK contains utilities for structuring this data and methods for signing it will be added.

The available claims should be distributed to users through an off-chain channel, such as a website or a mobile app. The user can then submit the claim to the module, which will execute it if the signature is valid.

## Example

A DAO wants to distribute tokens to its members. The DAO has a safe with a ClaimSettlementModule installed. The DAO adds a set of addresses as validators allowed to create the claims. They create a claim for each user that will transfer 1000 tokens to the address of the caller if they hold an NFT denoting membership.

The data to be signed would be structured like this for user 1:

```
Claim (
    id: '0x0000000000001',
    stateCheck: TimeRangeSeconds(1630000000, 1640000000),
    userCheck: NFTOwner({DAO_MEMBERSHIP_TOKEN_ADDRESS}, 1),
    action: TransferERC20ToCaller({DAO_REWARD_TOKEN_ADDRESS}, 1000)
    )
```

An EIP712 compatible signature would be created for this claim, ensuring it is only claimable by this module and on the desired chain.

The user would then submit the claim to the module, which would execute it if the signature is valid.

## Solidity Compiler

The contracts have been developed with [Solidity 0.8.9](https://github.com/ethereum/solidity/releases/tag/v0.8.9) in mind. This version of Solidity made all arithmetic checked by default, therefore eliminating the need for explicit overflow or underflow (or other arithmetic) checks.

## Setup Guide

### Building

To build this project execute:

```
yarn install
yarn build
```

### Testing

To run all the tests execute:

```sh
yarn test
```

To generate the test coverage report execute:

```sh
yarn test:coverage
```

### Deployment

We use [upgrade manager](https://github.com/cardstack/upgrade-manager) library to deploy these contracts. You can check how to deploy or update the contract on [upgrade manager](https://github.com/cardstack/upgrade-manager).

## Security and Liability

All contracts are WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.

## License

Created under the [LGPL-3.0+ license](LICENSE).
