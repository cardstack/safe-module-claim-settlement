import { ethers } from "hardhat";
import { BigNumber, Signer, utils } from "ethers";
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
    return ethers.utils.keccak256(utils.toUtf8Bytes(this.typeString()));
  }

  abiEncode() {
    let abiCoder = new ethers.utils.AbiCoder();
    return abiCoder.encode(
      this.properties.map((o) => o.type),
      this.values
    );
  }

  typedData() {
    let type: { [key: string]: { name: string; type: string }[] } = {};
    type[this.structName] = this.properties;
    return type;
  }

  asMapping() {
    let data: { [key: string]: any } = {};
    this.properties.forEach((o, i) => {
      data[o.name] = this.values[i];
    });
    return data;
  }
}

export class TimeRangeSeconds extends SolidityStruct {
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

export class Address extends SolidityStruct {
  constructor(caller: string) {
    super("Address", [{ name: "caller", type: "address" }], [caller]);
  }
}

export class TransferERC20ToCaller extends SolidityStruct {
  constructor(token: string, amount: BigNumber) {
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

export class Claim {
  id: string;
  chainId: any;
  address: any;
  stateCheck: SolidityStruct;
  callerCheck: SolidityStruct;
  action: SolidityStruct;

  constructor(
    id: string,
    chainId: any,
    address: any,
    stateCheck: SolidityStruct,
    callerCheck: SolidityStruct,
    action: SolidityStruct
  ) {
    this.id = id;
    this.chainId = chainId;
    this.address = address;
    this.stateCheck = stateCheck;
    this.callerCheck = callerCheck;
    this.action = action;
  }

  typedData() {
    return getTypedData(
      this.chainId,
      this.address,
      this.id,
      this.stateCheck,
      this.callerCheck,
      this.action
    );
  }

  typeString() {
    let ownTypeString = `Claim(bytes32 id,${this.stateCheck.structName} state,${this.callerCheck.structName} caller,${this.action.structName} action)`;
    let subTypes = [
      this.stateCheck.typeString(),
      this.callerCheck.typeString(),
      this.action.typeString(),
    ].sort();
    let calculatedString = ownTypeString + subTypes.join("");
    return calculatedString;
  }

  typeHash() {
    return ethers.utils.keccak256(utils.toUtf8Bytes(this.typeString()));
  }

  sign(signer: SignerWithAddress) {
    let data = this.typedData();
    return signer._signTypedData(data.domain, data.types, data.message);
  }

  abiEncode(extraTypes: string[], extraData: any[]) {
    let abiCoder = new ethers.utils.AbiCoder();
    return abiCoder.encode(
      [
        "bytes32",
        "bytes32",
        "bytes32",
        "bytes",
        "bytes32",
        "bytes",
        "bytes32",
        "bytes",
        "bytes",
      ],
      [
        this.typeHash(),
        this.id,
        this.stateCheck.typeHash(),
        this.stateCheck.abiEncode(),
        this.callerCheck.typeHash(),
        this.callerCheck.abiEncode(),
        this.action.typeHash(),
        this.action.abiEncode(),
        abiCoder.encode(extraTypes, extraData),
      ]
    );
  }
}

export const getTypedData = (
  chainId: any,
  address: any,
  id: string,
  state: SolidityStruct,
  caller: SolidityStruct,
  action: SolidityStruct
) => {
  let types = {
    ...state.typedData(),
    ...caller.typedData(),
    ...action.typedData(),
    ...{
      Claim: [
        { name: "id", type: "bytes32" },
        { name: "state", type: state.structName },
        { name: "caller", type: caller.structName },
        { name: "action", type: action.structName },
      ],
    },
  };
  return {
    types: types,
    primaryType: "Claim",
    domain: {
      name: "CardstackClaimSettlementModule",
      version: "1",
      chainId: chainId,
      verifyingContract: address,
    },
    message: {
      id: id,
      state: state.asMapping(),
      caller: caller.asMapping(),
      action: action.asMapping(),
    },
  };
};
