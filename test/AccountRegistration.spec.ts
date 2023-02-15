import "@nomiclabs/hardhat-ethers";

import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

import { setupAvatar, setupTokens } from "./fixtures";
import { BigNumber, Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("accountRegistration", async () => {
  let staking: Contract,
    account1: SignerWithAddress,
    account2: SignerWithAddress;
  async function setupFixture() {
    const [account1, account2] = await ethers.getSigners();
    const { staking } = await setupTokens();
    const { avatar, tx } = await setupAvatar();
    return {
      wallets: {
        account1,
        account2,
      },
      assets: {
        staking,
      },
      avatar,
      tx,
    };
  }
  beforeEach(async () => {
    const fixture = await loadFixture(setupFixture);

    staking = fixture.assets.staking;

    account1 = fixture.wallets.account1;
    account2 = fixture.wallets.account2;
  });
  describe("Registering", async () => {
    it("Can register self and receive NFT", async () => {
      await staking
        .connect(account1)
        .register(account1.address, account1.address);
      expect(await staking.ownerOf(BigNumber.from(account1.address))).to.equal(
        account1.address
      );
    });
    it("Can list all NFTs owned by a user", async () => {
      // Transfer two to the same account
      await staking
        .connect(account1)
        .register(account1.address, account2.address);
      await staking
        .connect(account2)
        .register(account2.address, account2.address);

      expect(await staking.balanceOf(account2.address)).to.equal(2);

      // Get both held tokens
      const heldNfts = [
        (await staking.tokenOfOwnerByIndex(account2.address, 0)).toString(),
        (await staking.tokenOfOwnerByIndex(account2.address, 1)).toString(),
      ];
      // Convert to strings to avoid casing issues with hex & BigNumber
      expect(heldNfts).to.include.members([
        BigNumber.from(account1.address).toString(),
        BigNumber.from(account2.address).toString(),
      ]);
    });
    it("Can register self and receive NFT in another account", async () => {
      await staking
        .connect(account1)
        .register(account1.address, account2.address);
      expect(await staking.ownerOf(BigNumber.from(account1.address))).to.equal(
        account2.address
      );
    });
    it("Does not let an account register on behalf of another", async () => {
      await expect(
        staking.connect(account2).register(account1.address, account2.address)
      ).to.be.revertedWith(
        "AccountRegistration: registration account must be the sender"
      );
    });
  });
  describe("Unregistering", async () => {
    it("Can remove tokens owned by self", async () => {
      await staking
        .connect(account1)
        .register(account1.address, account1.address);
      expect(await staking.ownerOf(BigNumber.from(account1.address))).to.equal(
        account1.address
      );
      await staking
        .connect(account1)
        .unregister(BigNumber.from(account1.address));
      await expect(
        staking.ownerOf(BigNumber.from(account1.address))
      ).to.be.revertedWith("ERC721: invalid token ID");
    });
    it("Cannot unregister from an account that doesn't own the NFT", async () => {
      // Register 1 and and transfer to 2
      await staking
        .connect(account1)
        .register(account1.address, account2.address);
      expect(await staking.ownerOf(BigNumber.from(account1.address))).to.equal(
        account2.address
      );
      // Try to unregister from 1
      await expect(
        staking.connect(account1).unregister(BigNumber.from(account1.address))
      ).to.be.revertedWith("ERC721: caller is not token owner or approved");
    });
  });
});
