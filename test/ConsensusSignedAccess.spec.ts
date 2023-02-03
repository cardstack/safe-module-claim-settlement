import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { ethers } from "hardhat";
import "@nomiclabs/hardhat-ethers";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";

import { setupAvatar, setupConfig, setupTokens } from "./fixtures";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { signMessage } from "./utils";

describe("ConsensusSignedAccessModule", async () => {
  const abiCoder = new ethers.utils.AbiCoder();
  const mintAmount = BigNumber.from(ethers.utils.parseUnits("10", "ether"));

  async function setupFixture() {
    const [deployer, validator1, validator2, payee] = await ethers.getSigners();
    const { token, gasToken } = await setupTokens();
    const { avatar, tx } = await setupAvatar();
    const config = await setupConfig();
    const ConsensusSignedAccessModule = await ethers.getContractFactory(
      "ConsensusSignedAccessModule",
      { signer: deployer }
    );
    const consensusSignedAccessModule =
      await ConsensusSignedAccessModule.deploy(
        validator1.address,
        avatar.address,
        avatar.address,
        token.address
      );
    // Validators must have sufficient token owned
    await token.mint(avatar.address, mintAmount);
    await avatar.enableModule(consensusSignedAccessModule.address);
    return {
      wallets: {
        validator1,
        validator2,
        payee,
        deployer,
      },
      token,
      gasToken,
      avatar,
      tx,
      modules: {
        consensusSignedAccessModule,
      },
      config,
    };
  }

  describe("consensusExecute()", async () => {
    let avatar: Contract,
      token: Contract,
      consensusSignedAccessModule: Contract,
      validator1: SignerWithAddress,
      validator2: SignerWithAddress,
      payee: SignerWithAddress,
      leaf: string,
      startFrom: number;
    const transferAmount = BigNumber.from(
      ethers.utils.parseUnits("1", "ether")
    );
    beforeEach(async () => {
      const fixture = await loadFixture(setupFixture);
      avatar = fixture.avatar;
      token = fixture.token;
      consensusSignedAccessModule = fixture.modules.consensusSignedAccessModule;
      validator1 = fixture.wallets.validator1;
      validator2 = fixture.wallets.validator2;
      payee = fixture.wallets.payee;
      startFrom = await time.latest();
      leaf = abiCoder.encode(
        ["address", "bytes4", "bytes", "bytes", "bytes"],
        [
          consensusSignedAccessModule.address,
          [1, 1, 0, 4],
          abiCoder.encode(
            ["address", "uint256", "uint256"],
            [avatar.address, startFrom, startFrom + 100]
          ),
          abiCoder.encode([], []),
          abiCoder.encode(
            ["address", "uint256", "address"],
            [token.address, transferAmount, payee.address]
          ),
        ]
      );
    });
    it("transfer token (consensus reached)", async () => {
      await token.mint(validator1.address, 500);
      await token.mint(validator2.address, 500);
      const signatures = [
        (await signMessage(leaf, validator1)).encodedSignature,
        (await signMessage(leaf, validator2)).encodedSignature,
      ];
      expect(await token.balanceOf(payee.address)).to.equal(0);
      await consensusSignedAccessModule
        .connect(payee)
        .consensusExecute(signatures, leaf, abiCoder.encode([], []));

      expect(await token.balanceOf(payee.address)).to.equal(transferAmount);
      expect(await token.balanceOf(avatar.address)).to.equal(
        mintAmount.sub(transferAmount)
      );
    });

    it("fail if not enough signatures", async () => {
      await token.mint(validator1.address, 500);
      await token.mint(validator2.address, 500);
      const signatures = [
        (await signMessage(leaf, validator1)).encodedSignature,
      ];
      expect(await token.balanceOf(payee.address)).to.equal(0);
      await expect(
        consensusSignedAccessModule
          .connect(payee)
          .consensusExecute(signatures, leaf, abiCoder.encode([], []))
      ).to.be.revertedWith("not backed by enough signers");
    });
    it("fail if validator does not have enough staked", async () => {
      await token.mint(validator1.address, 500);
      await token.mint(validator2.address, 100);
      const signatures = [
        (await signMessage(leaf, validator1)).encodedSignature,
        (await signMessage(leaf, validator2)).encodedSignature,
      ];
      await expect(
        consensusSignedAccessModule
          .connect(payee)
          .consensusExecute(signatures, leaf, abiCoder.encode([], []))
      ).to.be.revertedWith("not backed by enough signers");
    });
  });
});
