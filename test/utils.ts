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

class SolidityStruct {
  properties: { name: string; type: string }[];
  values: any[];
  structName: string;

  constructor(
    structName: string,
    properties: { name: string; type: string }[],
    values: any[]
  ) {
    this.structName = structName;
    this.properties = properties;
    this.values = values;
  }

  typeString() {
    let structArguments = this.properties
      .map((o) => o.type + " " + o.name)
      .join(",");
    return `${this.structName}(${structArguments})`;
  }

  typeHash() {
    return ethers.utils.keccak256(this.typeString());
  }

  abiEncode() {
    let abiCoder = new ethers.utils.AbiCoder();
    return abiCoder.encode(
      this.properties.map((o) => o.type),
      this.values
    );
  }

  typedData () {
    return {
      `${this.structName}` : this.properties
    }
  }
}

class TimeRangeSeconds extends SolidityStruct {
  constructor(validFromTime: number, validToTime: number) {
    super(
      "TimeRangeSeconds",
      [
        { name: "validFromTime", type: "uint256" },
        { name: "validToTime", type: "uint256" },
      ],
      [validFromTime, validToTime]
    );
  }
}

class Address extends SolidityStruct {
  constructor(user: string) {
    super("Address", [{ name: "user", type: "address" }], [user]);
  }
}

class TransferERC20ToCaller extends SolidityStruct {
  constructor(token: string, amount: number) {
    super(
      "TransferERC20ToCaller",
      [
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      [token, amount]
    );
  }
}

export const getTypedData = (
  chainId: any,
  address: any,
  data: any,
  stateType: string,
  userType: string,
  actionType: string
) => {
  return {
    types: {
      // EIP712Domain: [
      //   { name: "name", type: "string" },
      //   { name: "version", type: "string" },
      //   { name: "chainId", type: "uint256" },
      //   { name: "verifyingContract", type: "address" },
      // ],
      TimeRangeSeconds: [
        { name: "validFromTime", type: "uint256" },
        { name: "validToTime", type: "uint256" },
      ],
      // TimeRangeBlocks: [
      //  { name: "validFromBlock", type: "uint256" },
      //  { name: "validToBlock", type: "uint256" },
      //],
      Address: [{ name: "user", type: "address" }],
      //NFTOwner: [
      //  { name: "address", type: "address" },
      //  { name: "tokenId", type: "uint256" },
      //],
      TransferERC20ToCaller: [
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      //TransferERC721ToCaller: [
      //  { name: "token", type: "address" },
      //  { name: "tokenId", type: "uint256" },
      //],
      Claim: [
        { name: "id", type: "bytes32" },
        { name: "state", type: stateType },
        { name: "user", type: userType },
        { name: "action", type: actionType },
      ],
    },
    primaryType: "Claim",
    domain: {
      name: "CardstackClaimSettlementModule",
      version: "1",
      chainId: chainId,
      verifyingContract: address,
    },
    message: data,
  };
};
