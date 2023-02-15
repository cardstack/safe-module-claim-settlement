import "@nomiclabs/hardhat-ethers";

import { expect } from "chai";
import { ethers, getChainId } from "hardhat";
import {
  loadFixture,
  time,
  mine,
} from "@nomicfoundation/hardhat-network-helpers";

import { setupAvatar, setupTokens } from "./fixtures";
import {
  TimeRangeSeconds,
  Address,
  TransferERC20ToCaller,
  TransferNFTToCaller,
  Claim,
  NFTOwner,
} from "./utils";
import { BigNumber, Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { AddressZero } from "@ethersproject/constants";

describe("claimSettlement", async () => {
  const mintAmount = BigNumber.from(ethers.utils.parseUnits("10", "ether"));
  async function setupFixture() {
    const [deployer, validator, payee1, payee2] = await ethers.getSigners();
    const { token, gasToken, nft, staking } = await setupTokens();
    const { avatar, tx } = await setupAvatar();
    const ClaimSettlement = await ethers.getContractFactory("ClaimSettlement", {
      signer: deployer,
    });
    const claimSettlement = await ClaimSettlement.deploy(
      validator.address,
      avatar.address,
      avatar.address
    );
    await avatar.enableModule(claimSettlement.address);
    await token.mint(avatar.address, mintAmount);
    await gasToken.mint(avatar.address, mintAmount);
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
        staking,
      },
      avatar,
      tx,
      modules: {
        claimSettlement,
      },
    };
  }

  describe("signedExecute()", async () => {
    let avatar: Contract,
      token: Contract,
      nft: Contract,
      staking: Contract,
      claimSettlement: Contract,
      deployer: SignerWithAddress,
      payee1: SignerWithAddress,
      payee2: SignerWithAddress,
      validator: SignerWithAddress,
      claim: Claim,
      startFrom: number;
    const transferAmount = BigNumber.from(
      ethers.utils.parseUnits("1", "ether")
    );

    beforeEach(async () => {
      const fixture = await loadFixture(setupFixture);
      avatar = fixture.avatar;
      token = fixture.assets.token;
      nft = fixture.assets.nft;
      staking = fixture.assets.staking;
      claimSettlement = fixture.modules.claimSettlement;
      payee1 = fixture.wallets.payee1;
      payee2 = fixture.wallets.payee2;
      validator = fixture.wallets.validator;
      deployer = fixture.wallets.deployer;
      startFrom = await time.latest();
      const addValidatorData = claimSettlement.interface.encodeFunctionData(
        "addValidator",
        [validator.address]
      );
      await avatar.execTransaction(
        claimSettlement.address,
        0,
        addValidatorData,
        0,
        0,
        0,
        0,
        AddressZero,
        AddressZero,
        "0x"
      );
    });
    describe("ERC20 transfers", async () => {
      beforeEach(async () => {
        claim = new Claim(
          "0x0000000000000000000000000000000000000000000000000000000000000001",
          await getChainId(),
          claimSettlement.address,
          new TimeRangeSeconds(startFrom, startFrom + 100),
          new Address(payee1.address),
          new TransferERC20ToCaller(token.address, transferAmount)
        );
      });
      it("transfer token", async () => {
        const signature = claim.sign(validator);
        const encoded = claim.abiEncode(["uint256"], [100000]);
        expect(await token.balanceOf(payee1.address)).to.equal(0);
        await claimSettlement.connect(payee1).signedExecute(signature, encoded);
        expect(await token.balanceOf(payee1.address)).to.equal(transferAmount);
        expect(await token.balanceOf(avatar.address)).to.equal(
          mintAmount.sub(transferAmount)
        );
      });
      it("cannot transfer token after validity period", async () => {
        const signature = claim.sign(validator);
        const encoded = claim.abiEncode(["uint256"], [100000]);
        await mine(101);
        expect(await token.balanceOf(payee1.address)).to.equal(0);
        await expect(
          claimSettlement.connect(payee1).signedExecute(signature, encoded)
        ).to.be.revertedWith("Invalid state");
      });
      it("cannot transfer if wrong signer", async () => {
        const signature = claim.sign(payee1);
        const encoded = claim.abiEncode(["uint256"], [100000]);
        expect(await token.balanceOf(payee1.address)).to.equal(0);
        await expect(
          claimSettlement.connect(payee1).signedExecute(signature, encoded)
        ).to.be.revertedWith("Invalid signature");
      });
      it("cannot transfer if wrong caller", async () => {
        const signature = claim.sign(validator);
        const encoded = claim.abiEncode(["uint256"], [100000]);
        expect(await token.balanceOf(payee1.address)).to.equal(0);
        await expect(
          claimSettlement.connect(payee2).signedExecute(signature, encoded)
        ).to.be.revertedWith("Caller cannot claim");
      });
      it("cannot transfer if leaf is already used", async () => {
        const signature = claim.sign(validator);
        const encoded = claim.abiEncode(["uint256"], [100000]);
        expect(await token.balanceOf(payee1.address)).to.equal(0);
        await claimSettlement.connect(payee1).signedExecute(signature, encoded);
        expect(await token.balanceOf(payee1.address)).to.equal(transferAmount);
        expect(await token.balanceOf(avatar.address)).to.equal(
          mintAmount.sub(transferAmount)
        );
        await expect(
          claimSettlement.connect(payee1).signedExecute(signature, encoded)
        ).to.be.revertedWith("Already claimed");
      });
      it("cannot transfer if leaf specifieds different module", async () => {
        const SignedAccessModule2 = await ethers.getContractFactory(
          "ClaimSettlement",
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
        const claimOnNewModule = new Claim(
          "0x0000000000000000000000000000000000000000000000000000000000000001",
          await getChainId(),
          signedAccessModule2.address,
          new TimeRangeSeconds(startFrom, startFrom + 100),
          new Address(payee1.address),
          new TransferERC20ToCaller(token.address, transferAmount)
        );
        const signature = claimOnNewModule.sign(validator);
        const encoded = claim.abiEncode(["uint256"], [100000]);
        await expect(
          claimSettlement.connect(payee1).signedExecute(signature, encoded)
        ).to.be.revertedWith("Not authorized");
      });
      it("Transfer to account holding NFT", async () => {
        await staking.connect(payee1).register(payee1.address, payee2.address);
        expect(await staking.ownerOf(BigNumber.from(payee1.address))).to.equal(
          payee2.address
        );
        const nftClaim = new Claim(
          "0x0000000000000000000000000000000000000000000000000000000000000001",
          await getChainId(),
          claimSettlement.address,
          new TimeRangeSeconds(startFrom, startFrom + 100),
          new NFTOwner(staking.address, BigNumber.from(payee1.address)),
          new TransferERC20ToCaller(token.address, transferAmount)
        );
        const signature = await nftClaim.sign(validator);
        const encoded = nftClaim.abiEncode(["uint256"], [100000]);
        await claimSettlement.connect(payee2).signedExecute(signature, encoded);
        expect(await staking.ownerOf(BigNumber.from(payee1.address))).to.equal(
          payee2.address
        );
        expect(await token.balanceOf(payee2.address)).to.equal(transferAmount);
        expect(await token.balanceOf(avatar.address)).to.equal(
          mintAmount.sub(transferAmount)
        );
      });
      it("Transfer to registered account", async () => {
        await staking.connect(payee1).register(payee1.address, payee1.address);
        const nftClaim = new Claim(
          "0x0000000000000000000000000000000000000000000000000000000000000001",
          await getChainId(),
          claimSettlement.address,
          new TimeRangeSeconds(startFrom, startFrom + 100),
          new NFTOwner(staking.address, BigNumber.from(payee1.address)),
          new TransferERC20ToCaller(token.address, transferAmount)
        );
        const signature = await nftClaim.sign(validator);
        const encoded = nftClaim.abiEncode(["uint256"], [100000]);
        await claimSettlement.connect(payee1).signedExecute(signature, encoded);
        expect(await staking.ownerOf(BigNumber.from(payee1.address))).to.equal(
          payee1.address
        );
        expect(await token.balanceOf(payee1.address)).to.equal(transferAmount);
        expect(await token.balanceOf(avatar.address)).to.equal(
          mintAmount.sub(transferAmount)
        );
      });
      it("can transfer if caller has an nft", async () => {
        await nft.mint(payee1.address, 1);
        const nftClaim = new Claim(
          "0x0000000000000000000000000000000000000000000000000000000000000001",
          await getChainId(),
          claimSettlement.address,
          new TimeRangeSeconds(startFrom, startFrom + 100),
          new NFTOwner(nft.address, BigNumber.from(1)),
          new TransferERC20ToCaller(token.address, transferAmount)
        );
        const signature = await nftClaim.sign(validator);
        const encoded = nftClaim.abiEncode(["uint256"], [100000]);
        await claimSettlement.connect(payee1).signedExecute(signature, encoded);
        expect(await nft.ownerOf(1)).to.equal(payee1.address);
        expect(await token.balanceOf(payee1.address)).to.equal(transferAmount);
        expect(await token.balanceOf(avatar.address)).to.equal(
          mintAmount.sub(transferAmount)
        );
      });
      it("cannot transfer if caller does not have an nft", async () => {
        // Give the NFT to someone else
        await nft.mint(payee2.address, 1);
        const nftClaim = new Claim(
          "0x0000000000000000000000000000000000000000000000000000000000000001",
          await getChainId(),
          claimSettlement.address,
          new TimeRangeSeconds(startFrom, startFrom + 100),
          new NFTOwner(nft.address, BigNumber.from(1)),
          new TransferERC20ToCaller(token.address, transferAmount)
        );
        const signature = await nftClaim.sign(validator);
        const encoded = nftClaim.abiEncode(["uint256"], [100000]);
        await expect(
          claimSettlement.connect(payee1).signedExecute(signature, encoded)
        ).to.be.revertedWith("Caller cannot claim");
      });
      it("cannot transfer if the nft has not been minted", async () => {
        const nftClaim = new Claim(
          "0x0000000000000000000000000000000000000000000000000000000000000001",
          await getChainId(),
          claimSettlement.address,
          new TimeRangeSeconds(startFrom, startFrom + 100),
          new NFTOwner(nft.address, BigNumber.from(100)),
          new TransferERC20ToCaller(token.address, transferAmount)
        );
        const signature = await nftClaim.sign(validator);
        const encoded = nftClaim.abiEncode(["uint256"], [100000]);
        await expect(
          claimSettlement.connect(payee1).signedExecute(signature, encoded)
        ).to.be.revertedWith("ERC721: invalid token ID"); // TODO: should we be catching this ourselves?
      });
      it("cannot transfer if the user has the wrong nft", async () => {
        await nft.mint(payee1.address, 2);
        const nftClaim = new Claim(
          "0x0000000000000000000000000000000000000000000000000000000000000001",
          await getChainId(),
          claimSettlement.address,
          new TimeRangeSeconds(startFrom, startFrom + 100),
          new NFTOwner(nft.address, BigNumber.from(1)),
          new TransferERC20ToCaller(token.address, transferAmount)
        );
        const signature = await nftClaim.sign(validator);
        const encoded = nftClaim.abiEncode(["uint256"], [100000]);
        await expect(
          claimSettlement.connect(payee1).signedExecute(signature, encoded)
        ).to.be.revertedWith("ERC721: invalid token ID");
      });
      it("transfer to safe", async () => {
        const { avatar: payee1Safe } = await setupAvatar(payee1);

        const safeClaim = new Claim(
          "0x0000000000000000000000000000000000000000000000000000000000000001",
          await getChainId(),
          claimSettlement.address,
          new TimeRangeSeconds(startFrom, startFrom + 100),
          new Address(payee1Safe.address),
          new TransferERC20ToCaller(token.address, transferAmount)
        );
        const signature = await safeClaim.sign(validator);
        const encoded = safeClaim.abiEncode(["uint256"], [100000]);
        expect(await token.balanceOf(payee1Safe.address)).to.equal(0);
        const data = claimSettlement.interface.encodeFunctionData(
          "signedExecute",
          [signature, encoded]
        );
        await payee1Safe
          .connect(payee1)
          .execTransaction(
            claimSettlement.address,
            0,
            data,
            0,
            0,
            0,
            0,
            AddressZero,
            AddressZero,
            "0x"
          );
        expect(await token.balanceOf(payee1Safe.address)).to.equal(
          transferAmount
        );
        expect(await token.balanceOf(avatar.address)).to.equal(
          mintAmount.sub(transferAmount)
        );
      });
    });
    describe("nft", async () => {
      beforeEach(async () => {
        await nft.mint(avatar.address, 1);
        claim = new Claim(
          "0x0000000000000000000000000000000000000000000000000000000000000001",
          await getChainId(),
          claimSettlement.address,
          new TimeRangeSeconds(startFrom, startFrom + 100),
          new Address(payee1.address),
          new TransferNFTToCaller(nft.address, BigNumber.from(1))
        );
      });
      it("transfer nft", async () => {
        const signature = await claim.sign(validator);
        const encoded = claim.abiEncode();
        expect(await nft.ownerOf(1)).to.equal(avatar.address);
        await claimSettlement.connect(payee1).signedExecute(signature, encoded);
        expect(await nft.ownerOf(1)).to.equal(payee1.address);
      });
    });
  });
  describe("addValidator()", async () => {
    let avatar: Contract,
      claimSettlement: Contract,
      validator: SignerWithAddress,
      payee1: SignerWithAddress;
    beforeEach(async () => {
      const fixture = await loadFixture(setupFixture);
      avatar = fixture.avatar;
      claimSettlement = fixture.modules.claimSettlement;
      validator = fixture.wallets.validator;
      payee1 = fixture.wallets.payee1;
    });
    it("can add validator", async () => {
      const data = claimSettlement.interface.encodeFunctionData(
        "addValidator",
        [validator.address]
      );
      await expect(
        await avatar.execTransaction(
          claimSettlement.address,
          0,
          data,
          0,
          0,
          0,
          0,
          AddressZero,
          AddressZero,
          "0x"
        )
      )
        .to.emit(claimSettlement, "ValidatorAdded")
        .withArgs(validator.address);
      expect(await claimSettlement.getValidators()).to.have.members([
        validator.address,
      ]);
      expect(
        await claimSettlement.isValidator(validator.address)
      ).to.have.equal(true);
    });
    it("non-avatar cannot add validator", async () => {
      await expect(
        claimSettlement.connect(payee1).addValidator(validator.address)
      ).to.be.revertedWith("caller is not the right avatar");
      expect(
        await claimSettlement.isValidator(validator.address)
      ).to.have.equal(false);
    });
  });
  describe("removeValidator()", async () => {
    let avatar: Contract,
      claimSettlement: Contract,
      validator: SignerWithAddress,
      payee1: SignerWithAddress;
    beforeEach(async () => {
      const fixture = await loadFixture(setupFixture);
      avatar = fixture.avatar;
      claimSettlement = fixture.modules.claimSettlement;
      validator = fixture.wallets.validator;
      payee1 = fixture.wallets.payee1;
      const data = claimSettlement.interface.encodeFunctionData(
        "addValidator",
        [validator.address]
      );
      await avatar.execTransaction(
        claimSettlement.address,
        0,
        data,
        0,
        0,
        0,
        0,
        AddressZero,
        AddressZero,
        "0x"
      );
    });
    it("can remove validator", async () => {
      const data = claimSettlement.interface.encodeFunctionData(
        "removeValidator",
        [validator.address]
      );
      await expect(
        await avatar.execTransaction(
          claimSettlement.address,
          0,
          data,
          0,
          0,
          0,
          0,
          AddressZero,
          AddressZero,
          "0x"
        )
      )
        .to.emit(claimSettlement, "ValidatorRemoved")
        .withArgs(validator.address);
      expect(await claimSettlement.getValidators()).to.be.an("array").that.is
        .empty;
      expect(
        await claimSettlement.isValidator(validator.address)
      ).to.have.equal(false);
    });
    it("non-avatar cannot remove validator", async () => {
      await expect(
        claimSettlement.connect(payee1).removeValidator(validator.address)
      ).to.be.revertedWith("caller is not the right avatar");
      expect(
        await claimSettlement.isValidator(validator.address)
      ).to.have.equal(true);
    });
  });
});
