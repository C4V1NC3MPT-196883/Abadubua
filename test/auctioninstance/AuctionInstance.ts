import { expect } from "chai";
import { getDefaultProvider } from "ethers";
import type { FhevmInstance } from "fhevmjs";
import { ethers } from "hardhat";

import { createInstances } from "../instance";
import { getSigners } from "../signers";
import { createTransaction } from "../utils";
import { getnewcontractfromdeploy, uint8ArrayToBytes32 } from "./AuctionInstance.fixture";

//import { uint8ArrayToBytes32 } from "./AuctionInstance.fixture";

describe("AuctionInstance", function () {
    before(async function () {
        this.signers = await getSigners(ethers);
        [this.contractAddress, this.callcontractAddress, this.callbobAddress] = await getnewcontractfromdeploy();
        this.InstanceContract = await ethers.getContractAt("AuctionInstance", this.contractAddress);
        this.instances = await createInstances(this.contractAddress, ethers, this.signers);
    });

    it("correct initialization?", async function () {
        expect(await this.InstanceContract.owner()).to.equal(this.callbobAddress);
        expect(await this.InstanceContract.address_auctioncall()).to.equal(this.callcontractAddress);
        expect(await this.InstanceContract.currentstate()).to.equal(0);
        expect(await this.InstanceContract.BiddersNum()).to.equal(0);

        const [detail0, detail1, detail2, detail3, detail4, detail5, detail6] =
            await this.InstanceContract.orderdetail();
        expect([detail0, detail1, detail2, detail3, detail4, detail6 - detail5]).to.deep.equal([
            "jinitaimei",
            "trashcoal",
            10,
            100,
            10,
            15,
        ]);
    });

    it("should successfully update state to closed", async function () {
        // const [, , , , , detail5, detail6] = await this.InstanceContract.orderdetail();
        // console.log(detail5, detail6);
        const checkfirst = await this.InstanceContract.connect(this.signers.dave).CheckState();
        await checkfirst.wait();
        expect(await this.InstanceContract.currentstate()).to.equal(0);
        // let currentBlock = await ethers.provider.getBlockNumber();
        // let block = await ethers.provider.getBlock(currentBlock);
        // let timenow = block.timestamp;
        // console.log(timenow, "第一次查时间");
        // console.log(await this.InstanceContract.currentstate(), "第一次查");
        await new Promise((resolve) => setTimeout(resolve, 15000));
        const checksecond = await this.InstanceContract.connect(this.signers.carol).CheckState();
        await checksecond.wait();
        expect(await this.InstanceContract.currentstate()).to.equal(1);
        // console.log(await checksecond.data(), "第11次查");
        // currentBlock = await ethers.provider.getBlockNumber();
        // block = await ethers.provider.getBlock(currentBlock);
        // timenow = block.timestamp;
        // console.log(timenow, "第二次查时间");
        // console.log(await this.InstanceContract.currentstate(), "第二次查");
    });

    it("shouldn't retract when the auction has closed", async function () {
        await new Promise((resolve) => setTimeout(resolve, 15000));
        // const checksecond = await this.InstanceContract.connect(this.signers.carol).CheckState();
        // await checksecond.wait();
        expect(await this.InstanceContract.connect(this.signers.bob).RetractMyAuction())
            .to.emit(this.InstanceContract, "ClosedEvent")
            .withArgs("The auction has been closed.");
    });

    it("correct retraction", async function () {
        // Carlo want to retract Bob's auction, this should be rejected!
        await expect(this.InstanceContract.connect(this.signers.carol).RetractMyAuction()).to.be.rejectedWith(
            "You are not the creator of this auction contract.",
        );

        // Now Bob retract his auction.
        const tx = await this.InstanceContract.connect(this.signers.bob).RetractMyAuction();
        await tx.wait();

        // should set the  state of this auction to retracted.
        const get_state = await this.InstanceContract.CheckState();
        expect(await this.InstanceContract.currentstate()).to.equal(2);

        //TODO: Bob want to retract again
    });
});
