import { ethers } from "hardhat";

import type { OrderMarket } from "../../types";
import { getSigners } from "../signers";

export async function deployOrderMarketFixture(): Promise<OrderMarket> {
    const signers = await getSigners(ethers);

    const contractFactory = await ethers.getContractFactory("OrderMarket");
    const contract = await contractFactory.connect(signers.alice).deploy(2); /**默认构造中的maxOrderCount=2  */
    await contract.waitForDeployment();

    return contract;
}
