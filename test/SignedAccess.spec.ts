import "@nomiclabs/hardhat-ethers";

import { expect } from "chai";
import { ethers } from "hardhat";

import {
  loadFixture,
  time,
  mine,
} from "@nomicfoundation/hardhat-network-helpers";

import { setupAvatar, setupTokens } from "./fixtures";
import { signMessage, getNativeBalance, gasUsedByTx } from "./utils";
import { BigNumber, Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("SignedAccessModule", async () => {
  const mintAmount = BigNumber.from(ethers.utils.parseUnits("10", "ether"));
  const abiCoder = new ethers.utils.AbiCoder();
  async function setupFixture() {
    const [deployer, validator, payee1, payee2] = await ethers.getSigners();
    const { token, gasToken, nft } = await setupTokens();
    const { avatar, tx } = await setupAvatar();
    const SignedAccessModule = await ethers.getContractFactory(
      "SignedAccessModule",
      {
        signer: deployer,
      }
    );
    const signedAccessModule = await SignedAccessModule.deploy(
      validator.address,
      avatar.address,
      avatar.address
    );
    await avatar.enableModule(signedAccessModule.address);
    await token.mint(avatar.address, mintAmount);
    await gasToken.mint(avatar.address, mintAmount);
    await nft.mint(avatar.address, 1);
    return {
      wallets: {
        payee1,
        payee2,
        validator,
        deployer,
      },
      assets: {
        nft,
        token,
        gasToken,
      },
      avatar,
      tx,
      modules: {
        signedAccessModule,
      },
    };
  }

  describe("signedExecute()", async () => {
    let avatar: Contract,
      token: Contract,
      nft: Contract,
      signedAccessModule: Contract,
      deployer: SignerWithAddress,
      payee1: SignerWithAddress,
      payee2: SignerWithAddress,
      validator: SignerWithAddress,
      leaf: string,
      startFrom: number;
    const transferAmount = BigNumber.from(
      ethers.utils.parseUnits("1", "ether")
    );

    beforeEach(async () => {
      const fixture = await loadFixture(setupFixture);
      avatar = fixture.avatar;
      token = fixture.assets.token;
      nft = fixture.assets.nft;
      signedAccessModule = fixture.modules.signedAccessModule;
      payee1 = fixture.wallets.payee1;
      payee2 = fixture.wallets.payee2;
      validator = fixture.wallets.validator;
      deployer = fixture.wallets.deployer;
      startFrom = await time.latest();
    });
    describe("format 4 (ERC20)", async () => {
      beforeEach(async () => {
        leaf = abiCoder.encode(
          ["address", "bytes4", "bytes", "bytes", "bytes"],
          [
            signedAccessModule.address,
            [1, 1, 0, 4],
            abiCoder.encode(
              ["address", "uint256", "uint256"],
              [avatar.address, startFrom, startFrom + 100]
            ),
            abiCoder.encode([], []),
            abiCoder.encode(
              ["address", "uint256", "address"],
              [token.address, transferAmount, payee1.address]
            ),
          ]
        );
      });
      it("transfer token", async () => {
        const { r, s, v } = await signMessage(leaf, validator);
        expect(await token.balanceOf(payee1.address)).to.equal(0);
        await signedAccessModule
          .connect(payee1)
          .signedExecute(v, r, s, leaf, abiCoder.encode([], []));

        expect(await token.balanceOf(payee1.address)).to.equal(transferAmount);
        expect(await token.balanceOf(avatar.address)).to.equal(
          mintAmount.sub(transferAmount)
        );
      });
      it("cannot transfer token after validity period", async () => {
        const { r, s, v } = await signMessage(leaf, validator);
        await mine(101);
        await expect(
          signedAccessModule
            .connect(payee1)
            .signedExecute(v, r, s, leaf, abiCoder.encode([], []))
        ).to.be.revertedWith("invalid leaf");
      });
      it("cannot transfer if wrong signer", async () => {
        const { r, s, v } = await signMessage(leaf, payee1);
        await expect(
          signedAccessModule
            .connect(payee1)
            .signedExecute(v, r, s, leaf, abiCoder.encode([], []))
        ).to.be.revertedWith("invalid signature");
      });
      it("cannot transfer if wrong caller", async () => {
        leaf = abiCoder.encode(
          ["address", "bytes4", "bytes", "bytes", "bytes"],
          [
            signedAccessModule.address,
            [1, 1, 1, 4],
            abiCoder.encode(
              ["address", "uint256", "uint256"],
              [avatar.address, startFrom, startFrom + 100]
            ),
            abiCoder.encode(["address"], [validator.address]),
            abiCoder.encode(
              ["address", "uint256", "address"],
              [token.address, transferAmount, payee1.address]
            ),
          ]
        );
        const { r, s, v } = await signMessage(leaf, validator);
        await expect(
          signedAccessModule
            .connect(payee1)
            .signedExecute(v, r, s, leaf, abiCoder.encode([], []))
        ).to.be.revertedWith("invalid caller");
      });
      it("cannot transfer if leaf is already used", async () => {
        const { r, s, v } = await signMessage(leaf, validator);
        await signedAccessModule
          .connect(payee1)
          .signedExecute(v, r, s, leaf, abiCoder.encode([], []));
        await expect(
          signedAccessModule
            .connect(payee1)
            .signedExecute(v, r, s, leaf, abiCoder.encode([], []))
        ).to.be.revertedWith("invalid leaf");
      });
      it("cannot transfer if leaf specifieds different module", async () => {
        const SignedAccessModule2 = await ethers.getContractFactory(
          "SignedAccessModule",
          {
            signer: deployer,
          }
        );
        const signedAccessModule2 = await SignedAccessModule2.deploy(
          validator.address,
          avatar.address,
          avatar.address
        );
        await avatar.enableModule(signedAccessModule2.address);
        const { r, s, v } = await signMessage(leaf, validator);
        await expect(
          signedAccessModule2
            .connect(payee1)
            .signedExecute(v, r, s, leaf, abiCoder.encode([], []))
        ).to.be.revertedWith("invalid module");
      });
      it("can transfer if format isValid format=0", async () => {
        leaf = abiCoder.encode(
          ["address", "bytes4", "bytes", "bytes", "bytes"],
          [
            signedAccessModule.address,
            [1, 0, 0, 4],
            abiCoder.encode([], []),
            abiCoder.encode([], []),
            abiCoder.encode(
              ["address", "uint256", "address"],
              [token.address, transferAmount, payee1.address]
            ),
          ]
        );
        const { r, s, v } = await signMessage(leaf, validator);
        signedAccessModule
          .connect(payee1)
          .signedExecute(v, r, s, leaf, abiCoder.encode([], []));
      });
      it("cannot transfer if unrecognised format for isValid", async () => {
        leaf = abiCoder.encode(
          ["address", "bytes4", "bytes", "bytes", "bytes"],
          [
            signedAccessModule.address,
            [1, 10, 0, 4],
            abiCoder.encode([], []),
            abiCoder.encode([], []),
            abiCoder.encode(
              ["address", "uint256", "address"],
              [token.address, transferAmount, payee1.address]
            ),
          ]
        );
        const { r, s, v } = await signMessage(leaf, validator);
        await expect(
          signedAccessModule
            .connect(payee1)
            .signedExecute(v, r, s, leaf, abiCoder.encode([], []))
        ).to.be.revertedWith("invalid leaf");
      });
      it("cannot transfer if unrecognised format for isValidUser", async () => {
        leaf = abiCoder.encode(
          ["address", "bytes4", "bytes", "bytes", "bytes"],
          [
            signedAccessModule.address,
            [1, 1, 10, 4],
            abiCoder.encode(
              ["address", "uint256", "uint256"],
              [avatar.address, startFrom, startFrom + 100]
            ),
            abiCoder.encode([], []),
            abiCoder.encode(
              ["address", "uint256", "address"],
              [token.address, transferAmount, payee1.address]
            ),
          ]
        );
        const { r, s, v } = await signMessage(leaf, validator);
        await expect(
          signedAccessModule
            .connect(payee1)
            .signedExecute(v, r, s, leaf, abiCoder.encode([], []))
        ).to.be.revertedWith("invalid caller");
      });
      it("cannot transfer if unrecognised format for executeAction", async () => {
        leaf = abiCoder.encode(
          ["address", "bytes4", "bytes", "bytes", "bytes"],
          [
            signedAccessModule.address,
            [1, 1, 0, 10],
            abiCoder.encode(
              ["address", "uint256", "uint256"],
              [avatar.address, startFrom, startFrom + 100]
            ),
            abiCoder.encode([], []),
            abiCoder.encode(
              ["address", "uint256", "address"],
              [token.address, transferAmount, payee1.address]
            ),
          ]
        );
        const { r, s, v } = await signMessage(leaf, validator);
        await expect(
          signedAccessModule
            .connect(payee1)
            .signedExecute(v, r, s, leaf, abiCoder.encode([], []))
        ).to.be.revertedWith("action failed");
      });
      it("cannot transfer if payee does not have an nft", async () => {
        leaf = abiCoder.encode(
          ["address", "bytes4", "bytes", "bytes", "bytes"],
          [
            signedAccessModule.address,
            [1, 1, 2, 4],
            abiCoder.encode(
              ["address", "uint256", "uint256"],
              [avatar.address, startFrom, startFrom + 100]
            ),
            abiCoder.encode(["address", "uint256"], [nft.address, 1]),
            abiCoder.encode(
              ["address", "uint256", "address"],
              [token.address, transferAmount, payee1.address]
            ),
          ]
        );
        const { r, s, v } = await signMessage(leaf, validator);
        await expect(
          signedAccessModule
            .connect(payee1)
            .signedExecute(v, r, s, leaf, abiCoder.encode([], []))
        ).to.be.revertedWith("invalid caller");
      });
    });
    describe("format 3 (ERC20)", async () => {
      beforeEach(async () => {
        leaf = abiCoder.encode(
          ["address", "bytes4", "bytes", "bytes", "bytes"],
          [
            signedAccessModule.address,
            [1, 1, 0, 3],
            abiCoder.encode(
              ["address", "uint256", "uint256"],
              [avatar.address, startFrom, startFrom + 100]
            ),
            abiCoder.encode([], []),
            abiCoder.encode(
              ["address", "uint256"],
              [token.address, transferAmount]
            ),
          ]
        );
      });

      it("transfer token", async () => {
        const { r, s, v } = await signMessage(leaf, validator);
        expect(await token.balanceOf(payee1.address)).to.equal(0);
        await signedAccessModule
          .connect(payee1)
          .signedExecute(
            v,
            r,
            s,
            leaf,
            abiCoder.encode(["address"], [payee1.address])
          );

        expect(await token.balanceOf(payee1.address)).to.equal(transferAmount);
        expect(await token.balanceOf(avatar.address)).to.equal(
          mintAmount.sub(transferAmount)
        );
      });
      it("transfer token to another person", async () => {
        const { r, s, v } = await signMessage(leaf, validator);
        expect(await token.balanceOf(payee2.address)).to.equal(0);
        await signedAccessModule
          .connect(payee1)
          .signedExecute(
            v,
            r,
            s,
            leaf,
            abiCoder.encode(["address"], [payee2.address])
          );

        expect(await token.balanceOf(payee2.address)).to.equal(transferAmount);
        expect(await token.balanceOf(avatar.address)).to.equal(
          mintAmount.sub(transferAmount)
        );
      });
    });
    describe("format 2 (native)", async () => {
      beforeEach(async () => {
        leaf = abiCoder.encode(
          ["address", "bytes4", "bytes", "bytes", "bytes"],
          [
            signedAccessModule.address,
            [1, 1, 0, 2],
            abiCoder.encode(
              ["address", "uint256", "uint256"],
              [avatar.address, startFrom, startFrom + 100]
            ),
            abiCoder.encode([], []),
            abiCoder.encode(
              ["uint256", "address"],
              [transferAmount, payee1.address]
            ),
          ]
        );
      });

      it("transfer token", async () => {
        await deployer.sendTransaction({
          to: avatar.address,
          value: transferAmount, // Sends exactly 1.0 ether
        });
        expect(await getNativeBalance(avatar.address)).to.equal(transferAmount);
        const { r, s, v } = await signMessage(leaf, validator);
        const initialBalance = await getNativeBalance(payee1.address);
        const tx = await signedAccessModule
          .connect(payee1)
          .signedExecute(v, r, s, leaf, abiCoder.encode([], []));
        const receipt = await tx.wait();
        const gasUsed = gasUsedByTx(receipt);
        expect(await getNativeBalance(payee1.address)).to.equal(
          initialBalance.sub(gasUsed).add(transferAmount)
        );
        expect(await getNativeBalance(avatar.address)).to.equal("0");
      });
    });
    describe("format 1 (native)", async () => {
      beforeEach(async () => {
        leaf = abiCoder.encode(
          ["address", "bytes4", "bytes", "bytes", "bytes"],
          [
            signedAccessModule.address,
            [1, 1, 0, 1],
            abiCoder.encode(
              ["address", "uint256", "uint256"],
              [avatar.address, startFrom, startFrom + 100]
            ),
            abiCoder.encode([], []),
            abiCoder.encode(["uint256"], [transferAmount]),
          ]
        );
      });
      it("transfer token", async () => {
        await deployer.sendTransaction({
          to: avatar.address,
          value: transferAmount, // Sends exactly 1.0 ether
        });
        expect(await getNativeBalance(avatar.address)).to.equal(transferAmount);
        const { r, s, v } = await signMessage(leaf, validator);
        const initialBalance = await getNativeBalance(payee1.address);
        const tx = await signedAccessModule
          .connect(payee1)
          .signedExecute(
            v,
            r,
            s,
            leaf,
            abiCoder.encode(["address"], [payee1.address])
          );
        const receipt = await tx.wait();
        const gasUsed = gasUsedByTx(receipt);
        expect(await getNativeBalance(payee1.address)).to.equal(
          initialBalance.sub(gasUsed).add(transferAmount)
        );
        expect(await getNativeBalance(avatar.address)).to.equal("0");
      });
      it("transfer token to another person", async () => {
        await deployer.sendTransaction({
          to: avatar.address,
          value: transferAmount, // Sends exactly 1.0 ether
        });
        expect(await getNativeBalance(avatar.address)).to.equal(transferAmount);
        const { r, s, v } = await signMessage(leaf, validator);
        const initialBalancePayee1 = await getNativeBalance(payee1.address);
        const initialBalancePayee2 = await getNativeBalance(payee2.address);
        const tx = await signedAccessModule
          .connect(payee1)
          .signedExecute(
            v,
            r,
            s,
            leaf,
            abiCoder.encode(["address"], [payee2.address])
          );
        const receipt = await tx.wait();
        const gasUsed = gasUsedByTx(receipt);
        expect(await getNativeBalance(payee1.address)).to.equal(
          initialBalancePayee1.sub(gasUsed)
        );
        expect(await getNativeBalance(payee2.address)).to.equal(
          initialBalancePayee2.add(transferAmount)
        );
        expect(await getNativeBalance(avatar.address)).to.equal("0");
      });
    });
    describe("nft", async () => {
      beforeEach(async () => {
        leaf = abiCoder.encode(
          ["address", "bytes4", "bytes", "bytes", "bytes"],
          [
            signedAccessModule.address,
            [1, 1, 0, 5],
            abiCoder.encode(
              ["address", "uint256", "uint256"],
              [avatar.address, startFrom, startFrom + 100]
            ),
            abiCoder.encode([], []),
            abiCoder.encode(
              ["address", "address", "uint256"],
              [nft.address, payee1.address, 1]
            ),
          ]
        );
      });
      it("transfer nft", async () => {
        const { r, s, v } = await signMessage(leaf, validator);
        expect(await nft.ownerOf(1)).to.equal(avatar.address);
        await signedAccessModule
          .connect(payee1)
          .signedExecute(v, r, s, leaf, abiCoder.encode([], []));
        expect(await nft.ownerOf(1)).to.equal(payee1.address);
      });
    });
  });
});
