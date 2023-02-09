import { ethers } from "hardhat";
import { utils } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { TransactionReceipt } from "@ethersproject/providers";

export const getNativeBalance = async (address: string) => {
  return ethers.provider.getBalance(address);
};

export const signMessage = async (
  message: string,
  signer: SignerWithAddress
) => {
  const abiCoder = new ethers.utils.AbiCoder();
  const messageHashString = utils.keccak256(message);
  const messageHashBytes = utils.arrayify(messageHashString);
  const signature = await signer.signMessage(messageHashBytes);
  const r = signature.slice(0, 66);
  const s = "0x" + signature.slice(66, 130);
  const v = parseInt(signature.slice(130, 132), 16);
  const encodedSignature = abiCoder.encode(
    ["uint8", "bytes32", "bytes32"],
    [v, r, s]
  );
  return {
    signature,
    encodedSignature,
    r,
    s,
    v,
    messageHashBytes,
    messageHashString,
  };
};

export const gasUsedByTx = (receipt: TransactionReceipt) => {
  return receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice);
};

export const getMethodId = (functionSignature: string) => {
  return utils.id(functionSignature).substring(0, 10);
};
