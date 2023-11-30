import { expect } from "chai";
import { error } from "console";
import exp from "constants";
import type { FhevmInstance } from "fhevmjs";
import { ethers } from "hardhat";

import { createInstances } from "../instance";
import { getSigners } from "../signers";
import { createTransaction } from "../utils";
import { deployOrderMarketFixture } from "./OrderMarket.fixture";

describe("OrderMarket", function () {
    before(async function () {
        this.signers = await getSigners(ethers);
    });

    function uint8ArrayToBytes32(uint8Array: Uint8Array): string {
        // 将 Uint8Array 转换为 ethers.js 中的 BytesLike 类型
        const bytesLikeValue = ethers.getBytes(uint8Array);

        // 将 BytesLike 转换为 bytes32
        const bytes32Value = ethers.hexlify(bytesLikeValue);

        return bytes32Value;
    }

    beforeEach(async function () {
        const contract = await deployOrderMarketFixture();
        this.contractAddress = await contract.getAddress();
        this.auction = contract;
        this.instances = await createInstances(this.contractAddress, ethers, this.signers);
    });

    it("should set the correct maxOrderCount", async function () {
        expect(await this.auction.maxOrderCount()).to.equal(2);
    });

    it("should change the maxOrderCount to 4, then to 3", async function () {
        const tx1 = await this.auction.connect(this.signers.alice).setMaxOrderCount(4);
        await tx1.wait();
        expect(await this.auction.maxOrderCount()).to.equal(4);
        const tx2 = await this.auction.connect(this.signers.alice).setMaxOrderCount(3);
        await tx2.wait();
        expect(await this.auction.maxOrderCount()).to.equal(3);
    });

    it("test create new auction", async function () {
        const publicKey = this.instances.bob.getTokenSignature(this.contractAddress)!.publicKey;
        const pk_bob = uint8ArrayToBytes32(publicKey);

        // Bob creat his first auction
        const tx1_bob = await this.auction
            .connect(this.signers.bob)
            .createNewOrder(pk_bob, "test1", "coking coal", 10, 100, 5, 10);
        await tx1_bob.wait();
        expect(await this.auction._orderCount(this.signers.bob.address)).to.equal(1);

        // Bob create his second auction
        const tx2_bob = await this.auction
            .connect(this.signers.bob)
            .createNewOrder(pk_bob, "test2", "wood coal", 10, 100, 10, 10);
        await tx2_bob.wait();
        expect(await this.auction._orderCount(this.signers.bob.address)).to.equal(2);

        // Bob create his third auction, this will be rejected.
        await expect(
            this.auction.connect(this.signers.bob).createNewOrder(pk_bob, "test3", "coking coal", 10, 100, 5, 10),
        ).to.be.rejectedWith(
            "You have reached the maximum number of auction initiations and cannot start a new auction. We recommend that you either remove previous auctions or conclude them as soon as possible.",
        );

        expect(await this.auction._orderCount(this.signers.bob.address)).to.equal(2);

        // Now Alice change the limit to 3 and Bob can create his third auction
        const tx_alice = await this.auction.connect(this.signers.alice).setMaxOrderCount(3);
        await tx_alice.wait();
        // Now Bob can create his third auction
        const tx3_bob = await this.auction
            .connect(this.signers.bob)
            .createNewOrder(pk_bob, "test4", "wood coal", 10, 100, 10, 10);
        await tx3_bob.wait();
        expect(await this.auction._orderCount(this.signers.bob.address)).to.equal(3);
    });

    it("cancel and finalize shouldn't get called by non-auction-like address", async function () {
        const publicKey_bob = this.instances.bob.getTokenSignature(this.contractAddress)!.publicKey;
        const pk_bob = uint8ArrayToBytes32(publicKey_bob);

        const tx1_bob = await this.auction
            .connect(this.signers.bob)
            .createNewOrder(pk_bob, "test1", "coking coal", 10, 100, 5, 10);
        await tx1_bob.wait();
        await expect(this.auction.connect(this.signers.bob).finalizeOrder()).to.be.rejected;

        const publicKey_carol = this.instances.carol.getTokenSignature(this.contractAddress)!.publicKey;
        const pk_carol = uint8ArrayToBytes32(publicKey_carol);

        const tx1_carol = await this.auction
            .connect(this.signers.carol)
            .createNewOrder(pk_carol, "test111", "coking1 coal", 10, 100, 5, 10);
        await tx1_carol.wait();
        await expect(this.auction.connect(this.signers.bob).finalizeOrder()).to.be.rejected;
        await expect(this.auction.connect(this.signers.carol).finalizeOrder()).to.be.rejected;
    });

    it("auction_owner makes correct records.", async function () {
        const publicKey_bob = this.instances.bob.getTokenSignature(this.contractAddress)!.publicKey;
        const pk_bob = uint8ArrayToBytes32(publicKey_bob);

        const tx1_bob = await this.auction
            .connect(this.signers.bob)
            .createNewOrder(pk_bob, "test1", "coking coal", 10, 100, 5, 10);
        const logsoftx1 = await tx1_bob.wait();
        const newinstanceaddress = await logsoftx1.logs[0].args[1];
        expect(await this.auction._orderOwner(newinstanceaddress)).to.equal(this.signers.bob.address);
    });
});
