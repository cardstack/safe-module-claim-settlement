import { AddressZero } from "@ethersproject/constants";
import { ethers } from "hardhat";

export const setupTokens = async () => {
  const [deployer] = await ethers.getSigners();
  const Token = await ethers.getContractFactory("TestToken", {
    signer: deployer,
  });
  const token = await Token.deploy("TestToken", "TestToken", 18);
  const gasToken = await Token.deploy("GasToken", "GasToken", 18);
  const Nft = await ethers.getContractFactory("TestNft", {
    signer: deployer,
  });
  const nft = await Nft.deploy("TestNft", "TestNft");
  return { token, gasToken, nft };
};
//Just return zero address
export const setupConfig = async () => {
  return AddressZero;
};
export const setupAvatar = async () => {
  const [deployer] = await ethers.getSigners();
  const avatarFactory = await ethers.getContractFactory("TestAvatar", {
    signer: deployer,
  });
  const avatar = await avatarFactory.deploy();
  const tx = {
    to: avatar.address,
    value: 0,
    data: "0x",
    operation: 0,
    avatarTxGas: 0,
    baseGas: 0,
    gasPrice: 0,
    gasToken: AddressZero,
    refundReceiver: AddressZero,
    signatures: "0x",
  };
  return { avatar, tx };
};
