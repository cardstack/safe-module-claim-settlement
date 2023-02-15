import { getSigner } from "@cardstack/upgrade-manager/dist/src/util";
import { DeployConfig } from "@cardstack/upgrade-manager/dist/src/types";
import {
  SafeSignature,
  safeTransaction,
} from "@cardstack/upgrade-manager/dist/src/safe";
import { task } from "hardhat/config";
import { Interface } from "ethers/lib/utils";
import { HardhatRuntimeEnvironment } from "hardhat/types";

export async function execSafeTransaction(
  config: DeployConfig,
  safeAddress: string,
  moduleAddress: string,
  callback: (
    iface: Interface,
    currentValidators: string[]
  ) => string | Promise<any>
): Promise<SafeSignature[] | undefined> {
  //TODO: this only supports threshold 1 ownership on safe. Need to implement threshold > 1
  const signer = await getSigner(config);
  console.log(signer.address);
  const module = await config.hre.ethers.getContractAt(
    "contracts/ClaimSettlement.sol:ClaimSettlement",
    moduleAddress,
    signer
  );
  const currentValidators = await validators(config.hre, moduleAddress);
  // Gas prices occasionaly unpredictable
  // let feeData = await config.hre.ethers.provider.getFeeData();
  // console.log(feeData);
  let data = await callback(module.interface, currentValidators);
  return await safeTransaction({
    config,
    safeAddress: safeAddress,
    toContract: module,
    data,
  });
}

export async function validators(
  hre: HardhatRuntimeEnvironment,
  moduleAddress: string
): Promise<string[]> {
  const module = await hre.ethers.getContractAt(
    "contracts/ClaimSettlement.sol:ClaimSettlement",
    moduleAddress
  );
  const currentValidators = await module.getValidators();
  console.log(`The current validators are ${currentValidators}`);
  return currentValidators;
}

export async function addValidator(
  config: DeployConfig,
  safeAddress: string,
  moduleAddress: string,
  validatorAddress: string
): Promise<SafeSignature[] | undefined> {
  return await execSafeTransaction(
    config,
    safeAddress,
    moduleAddress,
    async (iface, currentValidators) => {
      if (currentValidators.includes(validatorAddress)) {
        throw new Error(
          `Validator is already included in validator set for ${moduleAddress}`
        );
      }
      return iface.encodeFunctionData("addValidator", [validatorAddress]);
    }
  );
}

export async function removeValidator(
  config: DeployConfig,
  safeAddress: string,
  moduleAddress: string,
  validatorAddress: string
): Promise<SafeSignature[] | undefined> {
  //TODO: this only supports threshold 1 ownership on safe. Need to implement threshold > 1
  return await execSafeTransaction(
    config,
    safeAddress,
    moduleAddress,
    async (iface, currentValidators) => {
      if (!currentValidators.includes(validatorAddress)) {
        throw new Error(
          `Validator is NOT in validator set for ${moduleAddress}`
        );
      }
      return iface.encodeFunctionData("removeValidator", [validatorAddress]);
    }
  );
}

task(
  "addValidator",
  "Adds validator by executing transaction from safe that enabled the module"
)
  .addPositionalParam("safeAddress")
  .addPositionalParam("moduleAddress", "Module enabled by safe")
  .addPositionalParam(
    "validatorAddress",
    "Validator to add to module that is able to sign transactions enabled by module"
  )
  .addOptionalParam("mnemonic")
  .setAction(async function (taskArguments, hre) {
    const { safeAddress, moduleAddress, validatorAddress, mnemonic } =
      taskArguments;

    const [signer] = await hre.ethers.getSigners();
    let config: DeployConfig = {
      hre,
      network: hre.network.name,
      deployAddress: signer.address,
      sourceNetwork: hre.network.name,
      forking: false,
      dryRun: false,
      autoConfirm: true,
      priorSignatures: [],
      immediateConfigApply: false,
      // ...(mnemonic && { mnemonic }),
    };
    await addValidator(config, safeAddress, moduleAddress, validatorAddress);
  });

task(
  "removeValidator",
  "Removes validator by executing transaction from safe that enabled the module"
)
  .addPositionalParam("safeAddress")
  .addPositionalParam("moduleAddress", "Module enabled by safe")
  .addPositionalParam(
    "validatorAddress",
    "Validator to add to module that is able to sign transactions enabled by module"
  )
  .addOptionalParam("mnemonic")
  .setAction(async function (taskArguments, hre) {
    const { safeAddress, moduleAddress, validatorAddress, mnemonic } =
      taskArguments;
    let config: DeployConfig = {
      hre,
      network: hre.network.name,
      deployAddress: validatorAddress,
      sourceNetwork: hre.network.name,
      forking: false,
      dryRun: false,
      autoConfirm: true,
      priorSignatures: [],
      immediateConfigApply: false,
      ...(mnemonic && { mnemonic }),
    };
    await removeValidator(config, safeAddress, moduleAddress, validatorAddress);
  });

task(
  "validators",
  "Adds validator by executing transaction from safe that enabled the module"
)
  .addPositionalParam("moduleAddress", "Module enabled by safe")
  .setAction(async function (taskArguments, hre) {
    await validators(hre, taskArguments.moduleAddress);
  });
