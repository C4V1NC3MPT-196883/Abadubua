// SPDX-License-Identifier: UNLICENCED
pragma solidity >=0.8.0 <0.9.0;

import "./AuctionCall.sol";
import "fhevm/lib/TFHE.sol";

// TODO:调整顺序 把public放前面。
// TODO:用cmux算出具体的成交人数，然后按照成交人数依次门限解密Cindex，然后用每个Cindex对应的pk和卖方进行重加密，注意：在Bidding_Address中添加pk一行。
// TODO:Owner.sol整合到AuctionCall中
// TODO:通过枚举类型enum来管理auction_state和auction_retracted状态：四种情况可接受报价、关闭报价窗口、拍卖撤回、流拍。
// TODO:把publickey4seller变成constructor的参数，FindWinner变成无输入。
// TODO:publickey和地址的对应检查，在bidding上面直接放publickey
// TODO:加通知：卖家发起了撤回；
//             结果出来了；
//             中心修改了auction_limit；
contract AuctionInstance {
    // 本合约用于构造拍卖订单的实例，卖方向中心（以./AuctionCall.sol为中心合约）传递订单相关参数后创建本合约。
    // 本合约创建后，买方只与本合约交互，进行报价、撤回报价等操作；报价时间截止后卖方进行报价锁定以及密文比价，最终获得拍卖结果。
    OrderDetail public orderdetail; // 全局变量orderdetail：用于存储买方可见的订单细节。
    address public _owner; // 全局变量_owner：用于指示卖方地址。
    address public address_auctioncall; // 全局变量address_auctioncall：用于指示中心合约地址。
    auction_state public currentstate;
    uint public BiddersNum;
    mapping(address => Bidding) Biddinglist; // 定义Biddinglist用于报价环节中买方报价状态的更新。
    BidderInfo[] BiddersInfoList; // 定义BiddingAddress用于存储与拍卖订单交互的买方地址，与Biddinglist配合便于锁价后对所有待排序订单的预处理。
    uint8 TrunctionNumber = uint8(orderdetail.Quantity / orderdetail.Minimalsplit);
    ExtractedFinal_parsed[] SortedParsedBiddings;
    uint8 WinnersNum;
    bytes32 owner_publickey;
    uint8 quantitylogrange = 16;

    constructor(OrderDetail memory _orderdetail, bytes32 _publickey) {
        // 合约构造函数，通过./AuctionCall.sol的CreateNewAuction函数中传递的参数_orderdetail来创建拍卖订单。
        orderdetail = _orderdetail; // 将参数_orderdetail写入全局变量orderdetail，记录订单可视细节。
        address_auctioncall = msg.sender; // 将创建此合约的地址（即CreateNewAuction所在的实例合约）写入全局变量address_auctioncall，作为本合约的中心合约地址。
        _owner = tx.origin; // 将CreateNewAuction的调用者地址写入全局变量_owner，作为本合约的创建者，即拍卖订单的卖方。
        owner_publickey = _publickey; // 将CreateNewAuction的调用者公钥写入全局变量owner_publickey，记录拍卖订单的卖方公钥。
    }

    function RetractMyAuction() public onlyOwner_self {
        // 卖方撤回本合约代表的拍卖，此方法只能由卖方通过中心合约的RetractAuction进行消息调用。
        require(currentstate != auction_state.retracted, "No auction with this address is in progress.");
        (bool hasbeen_retracted, ) = address_auctioncall.call(abi.encodeWithSignature("RetractAuction()"));
        require(hasbeen_retracted, "The call of retract has failed.");
        currentstate = auction_state.retracted;
    }

    function CheckState() public returns (auction_state) {
        // 检查拍卖状态的核心函数，如果订单处于不可变状态则直接返回auction_state，否则检查拍卖截止时间是否已到，若到则调整状态为closed。
        // CheckState还可以用于整个拍卖流程的状态控制流，其它public函数在调用时可以根据调用CheckState的修饰符控制。
        if (
            currentstate != auction_state.retracted ||
            currentstate != auction_state.unsold ||
            currentstate != auction_state.finished
        ) {
            if (block.timestamp > orderdetail.Deadline) {
                currentstate = auction_state.closed;
            }
            return currentstate;
        }
        return currentstate;
    }

    function RaiseBidding(
        // 买方调用的核心函数，用于发起报价。RaiseBidding接受序列化的密文bytes作为参数，包括单位报价和认领数量。
        // 函数具有四个修饰符，分别表征函数需要在拍卖未截止、不经过外包调用、非卖方本人调用以及拍卖未撤回的前提下才能被调用。
        bytes memory _priceinunit,
        bytes memory _quantity,
        bytes32 _publickey
    ) external OutsourceImmutability AddressMatchesPublickey(_publickey, msg.sender) AuctionOn forbidOwner {
        euint32 epriceinunit = TFHE.asEuint32(_priceinunit); // 将单位报价的密文bytes转化为euint32类型的密文。
        euint32 equantity = TFHE.asEuint32(_quantity); // 将认领数量的密文bytes转化为euint32类型的密文。
        euint32 ereservepriceinunit = TFHE.asEuint32(orderdetail.Reserve_PriceInUnit); // 将拍卖订单中单位底价的明文转化为euint32类型的密文。
        euint32 equantityintotal = TFHE.asEuint32(orderdetail.Quantity); // 将拍卖订单中总数量的明文转化为euint32类型的密文。
        euint32 eminimalsplit = TFHE.asEuint32(orderdetail.Minimalsplit); // 将拍卖订单中最小认领数量的明文转化为euint32类型的密文。
        ebool condition4price = TFHE.ge(epriceinunit, ereservepriceinunit); // 构造密文条件，判断单位报价是否大于等于拍卖订单中单位底价。
        ebool condition4enoughquantity = TFHE.le(equantity, equantityintotal); // 构造密文条件，判断认领数量是否小于等于拍卖订单中总数量。
        ebool condition4splitquantity = TFHE.le(eminimalsplit, equantity); // 构造密文条件，判断认领数量是否大于等于拍卖订单中最小认领数量。
        ebool condition4quantity = TFHE.and(condition4enoughquantity, condition4splitquantity);
        // 结合以上两条构造密文条件，判断买方认领数量是否满足拍卖订单要求；注意到创建订单阶段已在./AuctionCall.sol中约束了订单最小认领数量与总数量的关系。
        require( // 判断买方单位报价是否满足拍卖订单要求。
            TFHE.decrypt(condition4price),
            "The price for the current bidding is invalid, your state of bidding remains unchanged."
        );
        require( // 判断买方认领数量是否满足拍卖订单要求。
            TFHE.decrypt(condition4quantity),
            "The quantity for the current bidding is invalid, your state of bidding remains unchanged."
        );
        if (!Biddinglist[msg.sender].Liveness) {
            // 判断买方是否是第一次报价，如果是则将买方地址添加至BiddingAddress中记录下来。
            BiddersInfoList.push(BidderInfo(msg.sender, _publickey));
        }
        Biddinglist[msg.sender] = Bidding(epriceinunit, equantity, block.timestamp, true);
        // 将上述转化后的满足报价条件的买方报价信息存储至Biddinglist中，如果买方此前已有报价，则可以通过此方法覆盖，
        // Biddinglist中只会记录一个关于该买方的报价信息。
    }

    function RetractBidding() external AuctionOn OutsourceImmutability forbidOwner {
        // 修饰符功能如前，买方通过调用该函数对Biddinglist中记录的报价进行撤销。
        // 注意到Biddinglist对任一地址只能同时存在一个报价信息，因此撤回时只需初始化报价时间，后续考察有效报价时通过筛选报价时间的条件即可。
        Biddinglist[msg.sender].Liveness = false;
        Biddinglist[msg.sender].Bidding_Time = type(uint256).max;
    }

    function PrivacyPreservingOrdering() public onlyOwner_self AuctionClosed {
        // 卖方锁价并执行密文比价得到拍卖结果的核心函数，要求只有卖方本人能够发起锁价，并且此时拍卖已经截止且未被撤回该函数执行的主要原理如下：
        // 1、由拍卖订单信息计算订单最大分拆数TrunctionNumber，初始化一个长度为TrunctionNumber的数组SortedFinalBiddings；
        // 2、对BiddingAddress调用List_Sorting进行排序，此时BiddingAddress中的买方地址将按照对应Bidding_Time的顺序按优先级排序，且每个买方地址都对应有效报价;
        // 3、依次（由List_Sorting的排列）将BiddingAddress中出现的买方地址取出，在Biddinglist映射中读取密文报价信息，将该信息整合为线性化密文；
        // 4、将取出的线性化密文依次与已排序的线性化密文比较，通过cmux方法依照密文比较结果更新SortedFinalBiddings;
        // 5、SortedFinalBiddings排序完成后，将其各项密文重加密为卖方可解密的密文，并将BiddingAddress的结果返回给卖方供其解密Bidder_index的参考。
        // 计算订单最大分拆数TrunctionNumber。
        List_Sorting_Test(); // 调用List_Sorting对BiddingAddress进行（依照Bidding_Time）的排序和无效订单的过滤。
        BiddersNum = BiddersInfoList.length;
        //SortedParsedBiddings = new ExtractedFinal_parsed[](TrunctionNumber);
        if (BiddersNum == 0) {
            (bool hasbeen_terminated, ) = address_auctioncall.call(abi.encodeWithSignature("TerminateAuction()"));
            require(hasbeen_terminated, "The call of retract has failed.");
            currentstate = auction_state.unsold;
            return;
        }
        ExtractedFinal_linearized[] memory SortedLinearizedBiddings = new ExtractedFinal_linearized[](TrunctionNumber);
        for (uint8 i = 0; i < TrunctionNumber; i++) {
            // 初始化SortedFinalBiddings，长度为TrunctionNumber，初始化的Linearized_Ciphertext为0的密文（最小值）。
            SortedLinearizedBiddings[i] = ExtractedFinal_linearized(TFHE.asEuint8(0), TFHE.asEuint32(0));
        }
        for (uint j = 0; j < BiddersNum; j++) {
            // 依次取出BiddingAddress中的买方地址进行线性化密文的比较。
            Bidding memory currentbidding = Biddinglist[BiddersInfoList[j].Bidder_Address]; // 读取买方地址对应的拍卖订单信息，注意到买方地址一定对应Biddinglist中的有效报价。
            euint32 currentlinearizedbidding = CipherLinearization(currentbidding); // 通过当前读取的拍卖订单信息计算线性化密文。
            ebool[] memory SortConditions = new ebool[](TrunctionNumber + 1); // 初始化一个临时密文条件数组，记录密文比较结果，最后一个元素为false（即线性化密文一定不会和最后一个元素交换）。
            for (uint k = 0; k < TrunctionNumber; k++) {
                // 依次将取出的线性化密文依次与已排序的线性化密文比较，通过cmux方法依照密文比较结果更新SortedFinalBiddings。
                SortConditions[k] = TFHE.gt(
                    currentlinearizedbidding,
                    SortedLinearizedBiddings[k].Linearized_Ciphertext
                );
            }
            SortConditions[TrunctionNumber] = TFHE.asEbool(false); // 最后一个元素为false（即线性化密文一定不会和最后一个元素交换）。
            for (uint t = 0; t < TrunctionNumber; t++) {
                // 根据SortConditions中的密文比较结果更新SortedFinalBiddings。
                ExtractedFinal_linearized memory currentprocessing = SortedLinearizedBiddings[t]; // 取出SortedFinalBiddings中的当前密文，
                SortedLinearizedBiddings[TrunctionNumber - t - 1] = ExtractedFinal_linearized(
                    TFHE.cmux( // 通过cmux方法判断同下条件，但此时是为了将Bidder_Cindex按照线性化密文的比较结果跟踪过去。
                        TFHE.and(SortConditions[t], TFHE.not(SortConditions[t + 1])),
                        TFHE.asEuint8(j),
                        currentprocessing.Bidder_Cindex
                    ),
                    TFHE.cmux( // 通过cmux方法依照密文比较结果更新SortedFinalBiddings，如果当前线性化密文可以替换第t项而不能替换第t+1项，则替换第t项；否则cmux只会引起对应位置的重加密。
                        TFHE.and(SortConditions[t], TFHE.not(SortConditions[t + 1])),
                        currentlinearizedbidding,
                        currentprocessing.Linearized_Ciphertext
                    )
                );
            }
            // 比较更新原理：
            // 1、首先通过已排序的BiddingAddress中取出时间优先级最高的报价，将其整合为线性化密文；
            // 2、然后创建比较结果的密文bool值数组SortConditions，其中第k个位置的ebool对应的明文代表当前线性化密文严格优先于SortedFinalBiddings中位置k对应的线性化密文；
            // 3、此时SortConditions[k]的明文为true时表明当前线性化密文所在的ExtractedFinal具有替代SortedFinalBiddings[k]的可能；
            // 4、通过指标t依次检查相邻两项的ebool值，如果当前线性化密文可以替代SortedFinalBiddings[k]但不可以替代SortedFinalBiddings[k+1]，则表明当前线性化密文恰好可以替代SortedFinalBiddings[k]；
            // 5、注意到，SortCondition的最后一项对应明文为false，这表明线性化密文如果到SortedFinalBiddings的最后一项仍存在替代可能时，则其恰好为当前优先级最高的线性化密文；
            // 6、另注意到，由于后加入的线性化密文时间优先级变低，因此后加入的线性化密文如果与SortedFinalBiddings中某个的线性化密文对应相同明文（即单位报价与数量一致），则不具备替换的可能，
            // 因此ebool通过TFHE.gt来刻画，而非TFHE.ge。
            // 7、最终得到的SortedFinalBiddings是按照单位报价高优先-认领/分拆数量大优先-报价时间早优先的顺序从低到高排列的。
        }
        // 初始化ExtractedFinal数组SortedFinalBiddings：
        for (uint l = 0; l < TrunctionNumber; l++) {
            (euint32 parsed_cpriceinunit, euint32 parsed_cquantity) = ParseConponents(
                SortedLinearizedBiddings[l].Linearized_Ciphertext
            );
            SortedParsedBiddings.push(
                ExtractedFinal_parsed(SortedLinearizedBiddings[l].Bidder_Cindex, parsed_cpriceinunit, parsed_cquantity)
            );
        }
        WinnersNum = TFHE.decrypt(winnersnumber());
        (bool hasbeen_terminated, ) = address_auctioncall.call(abi.encodeWithSignature("TerminateAuction()"));
        require(hasbeen_terminated, "The call of retract has failed.");
        currentstate = auction_state.finished;
    }

    function RetriveResults() public AuctionFinished returns (TopBidder[] memory, address[] memory) {
        TopBidder[] memory TopBidders = new TopBidder[](WinnersNum);
        for (uint i = 0; i < WinnersNum; i++) {
            TopBidders[i] = TopBidder(
                TFHE.reencrypt(SortedParsedBiddings[i].Bidder_Cindex, owner_publickey),
                TFHE.reencrypt(SortedParsedBiddings[i].Parsed_Cpriceinunit, owner_publickey),
                TFHE.reencrypt(SortedParsedBiddings[i].Parsed_Cquantity, owner_publickey)
            );
        }
        address[] memory TopBidderAddresses = new address[](TrunctionNumber);
        for (uint j = 0; j < TrunctionNumber; j++) {
            TopBidderAddresses[j] = BiddersInfoList[j].Bidder_Address;
        }
        return (TopBidders, TopBidderAddresses);
    }

    function RetriveMyResults() public AuctionFinished returns (bytes memory) {
        bool existsflag = false;
        uint myindex;
        bytes32 mypublickey;
        for (uint i = 0; i < BiddersNum; i++) {
            if (msg.sender == BiddersInfoList[i].Bidder_Address) {
                existsflag = true;
                myindex = i;
                mypublickey = BiddersInfoList[i].Bidder_Publickey;
                break;
            }
        }
        assert(myindex >= 0 && myindex < BiddersNum);
        require(existsflag, "You are not a bidder in this auction.");
        euint8 cmyindex = TFHE.asEuint8(myindex);
        euint32 cmyquantity = TFHE.asEuint32(0);
        for (uint j = 0; j < TrunctionNumber; j++) {
            ebool ismyindex = TFHE.eq(cmyindex, SortedParsedBiddings[j].Bidder_Cindex);
            ebool winnernecessity = TFHE.asEbool(j < WinnersNum);
            cmyquantity = TFHE.cmux(
                TFHE.and(ismyindex, winnernecessity),
                SortedParsedBiddings[j].Parsed_Cquantity,
                cmyquantity
            );
        }
        return TFHE.reencrypt(cmyquantity, mypublickey);
    }

    function AddressFromPublicKey(bytes32 publicKey) private pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(publicKey)))));
    }

    function CipherLinearization(Bidding memory bidding) private view returns (euint32) {
        // 定义一个私有函数，用于将报价信息中的多属性密文转化为线性化后的密文，将优先级较高的属性放置到高位时需要对低位属性的长度进行扩展补偿，此处设置低位的数量属性补偿为16位。
        euint32 conpensatedprice = TFHE.mul(bidding.PriceInUnit, TFHE.asEuint32(2 ^ quantitylogrange)); // 将买方单位报价平移16位至高位。
        return TFHE.add(conpensatedprice, bidding.Quantity);
    }

    function ParseConponents(euint32 _linearizedbidding) private view returns (euint32, euint32) {
        euint32 parsed_cquantity = TFHE.rem(_linearizedbidding, 2 ^ quantitylogrange);
        euint32 parsed_cpriceinunit = TFHE.div(TFHE.sub(_linearizedbidding, parsed_cquantity), 2 ^ quantitylogrange);
        return (parsed_cpriceinunit, parsed_cquantity);
    }

    function List_Sorting_Test() private {
        uint lengthoflist = BiddersInfoList.length;
        uint nullindex = lengthoflist; // 定义nullindex作为标记位来记录排序后最大的对应Bidding_Time为0的地址，方便后续将nullindex之前（包含）的所有买方地址删除。初始化为不在列表中的最小位置。
        for (uint i = 0; i < lengthoflist - 1; i++) {
            // 关于明文报价时间的属性进行选择排序。
            uint flagindex = i;
            uint exchangedtime; // 定义flagindex作为选择排序的临时标记位，用于记录未排序元素中对应Bidding_Time最小的地址位置。
            for (uint j = i + 1; j < lengthoflist - 1; j++) {
                // 未排序的元素从第j + 1个位置开始。
                if (
                    Biddinglist[BiddersInfoList[j].Bidder_Address].Bidding_Time <
                    Biddinglist[BiddersInfoList[flagindex].Bidder_Address].Bidding_Time
                ) {
                    flagindex = j; // 更新当前已检查到的未排序元素中对应Bidding_Time最小的地址位置。
                }
            }
            if (flagindex != i) {
                // 只有flagindex与i位置不同时（即存在比第i个位置对应的Bidding_Time小的未排序元素）才进行交换。
                BidderInfo memory tmp1 = BiddersInfoList[flagindex];
                exchangedtime = Biddinglist[tmp1.Bidder_Address].Bidding_Time;
                BidderInfo memory tmp2 = BiddersInfoList[i];
                BiddersInfoList[i] = tmp1;
                BiddersInfoList[flagindex] = tmp2;
            }
            if (exchangedtime != type(uint256).max) {
                // 交换后，检查被交换的对应Bidding_Time最小项是否为0，若为0，则更新nullindex；这表明到目前为止nullindex之前（包含）的所有买方地址都对应无效报价。
                nullindex = i;
            }
        }
        if (nullindex != lengthoflist - 1) {
            // nullindex != lengthoflist，表明至少存在一个买方地址对应无效报价。
            uint poptimes = lengthoflist - nullindex - 1;
            while (poptimes > 0) {
                BiddersInfoList.pop();
                poptimes--;
            }
            //for (uint k = 0; k < lengthoflist - nullindex - 1; k++) {
            //    BidderInfo memory tmp3 = BiddersInfoList[k + nullindex + 1];
            //    BiddersInfoList[k] = tmp3;
            //}
        }
    }

    function List_Sorting(BidderInfo[] memory biddersinfolist) private view returns (BidderInfo[] memory) {
        // 定义一个私有函数，用于对BiddingAddress中出现的买方地址进行排序，排序的标准是买方地址在Biddinglist映射中对应的报价时间。
        // 依据报价时间排序，能够保证以该顺序将BiddingAddress中的买方地址自然地以时间优先顺序替换SortedFinalBiddings中的元素，相当于在线性化比较的外部已经提前实现了明文时间的排序。
        // List_Sorting在完成排序后会将所有撤回订单的买方地址（对应Bidding_Time为0的地址）删除，剩下的买方地址都对应了有效报价，这些有效报价将进一步进行线性化密文报价信息的排序。
        uint lengthoflist = biddersinfolist.length;
        uint nullindex = lengthoflist; // 定义nullindex作为标记位来记录排序后最大的对应Bidding_Time为0的地址，方便后续将nullindex之前（包含）的所有买方地址删除。初始化为不在列表中的最小位置。
        for (uint i = 0; i < lengthoflist - 1; i++) {
            // 关于明文报价时间的属性进行选择排序。
            uint flagindex = i; // 定义flagindex作为选择排序的临时标记位，用于记录未排序元素中对应Bidding_Time最小的地址位置。
            for (uint j = i + 1; j < lengthoflist - 2; j++) {
                // 未排序的元素从第j + 1个位置开始。
                if (
                    Biddinglist[biddersinfolist[j].Bidder_Address].Bidding_Time <
                    Biddinglist[biddersinfolist[flagindex].Bidder_Address].Bidding_Time
                ) {
                    flagindex = j; // 更新当前已检查到的未排序元素中对应Bidding_Time最小的地址位置。
                }
            }
            if (flagindex != i) {
                // 只有flagindex与i位置不同时（即存在比第i个位置对应的Bidding_Time小的未排序元素）才进行交换。
                (biddersinfolist[i], biddersinfolist[flagindex]) = (biddersinfolist[flagindex], biddersinfolist[i]);
            }
            if (Biddinglist[biddersinfolist[i].Bidder_Address].Bidding_Time == 0) {
                // 交换后，检查被交换的对应Bidding_Time最小项是否为0，若为0，则更新nullindex；这表明到目前为止nullindex之前（包含）的所有买方地址都对应无效报价。
                nullindex = i;
            }
        }
        if (nullindex != lengthoflist) {
            // nullindex != lengthoflist，表明至少存在一个买方地址对应无效报价。
            BidderInfo[] memory supportbiddersinfolist = new BidderInfo[](lengthoflist - nullindex - 1);
            for (uint k = 0; k < lengthoflist - nullindex - 1; k++) {
                supportbiddersinfolist[k] = biddersinfolist[k + nullindex + 1];
            }
            return supportbiddersinfolist;
        } else {
            // nullindex == lengthoflist，表明所有买方地址都对应有效报价，此时直接返回已排序的BiddingAddress。
            return biddersinfolist;
        }
    }

    function winnersnumber() private view returns (euint8) {
        euint8 thenumber = TFHE.asEuint8(0);
        euint32 accumulatedquantity = TFHE.asEuint32(0);
        euint32 cquantity = TFHE.asEuint32(orderdetail.Quantity);
        for (uint i = 0; i < TrunctionNumber; i++) {
            accumulatedquantity = TFHE.add(accumulatedquantity, SortedParsedBiddings[i].Parsed_Cquantity);
            ebool flag = TFHE.gt(accumulatedquantity, cquantity);
            thenumber = TFHE.cmux(flag, TFHE.add(thenumber, TFHE.asEuint8(1)), thenumber);
        }
        return thenumber;
    }

    enum auction_state {
        on,
        closed,
        retracted,
        unsold,
        finished
    }

    struct OrderDetail {
        // 定义结构体OrderDetail：通过创建拍卖订单时传递的参数构建，是拍卖订单对卖方可见和可参考的主要细节。
        string OrderInfo; // OrderInfo：卖方描述本拍卖订单的自定义文字信息，如题目、描述及其他非结构化细节。
        string Coal_Category; // Coal_Category：煤炭种类。
        uint256 Reserve_PriceInUnit; // Reserve_PriceInUnit：单位底价。
        uint256 Quantity; // Quantity：拍卖总数量。
        uint256 Minimalsplit; // Minimalsplit：最小可认领/可分拆数量，规定该值不超过拍卖总数量；小于拍卖总数量时为可拆分订单，否则为不可拆分订单。
        uint256 Launch_Time; // Launch_Time：拍卖开始时间。
        uint256 Deadline; // Deadline：拍卖截止时间。
    }

    struct Bidding {
        // 定义结构体Bidding：规定买方报价的基本信息。
        euint32 PriceInUnit; // PriceInUnit：单位报价。
        euint32 Quantity; // Quantity：认领/分拆数量。
        uint256 Bidding_Time; // Bidding_Time：报价时间。
        bool Liveness; // Liveness：记录买方在此拍卖订单中是否有过报价记录，此布尔值主要为便于锁价而设置。
    }

    struct ExtractedFinal_linearized {
        //定义结构体ExtractedFinal：在密文比价中需要对报价信息进行线性化，通过此结构体进行线性化密文的记录。
        euint8 Bidder_Cindex; // Bidder_Cindex：报价者在此拍卖订单中依照时间排列的序号。
        euint32 Linearized_Ciphertext; // Linearized_Ciphertext：线性化后的密文。
    }

    struct ExtractedFinal_parsed {
        euint8 Bidder_Cindex; // Bidder_Cindex：报价者在此拍卖订单中依照时间排列的序号。
        euint32 Parsed_Cpriceinunit;
        euint32 Parsed_Cquantity;
    }

    struct TopBidder {
        // 定义结构体TopBidder4seller：用于记录以卖方公钥重加密后的头部报价密文。
        bytes Bidder_index; // Bidder_index：报价者在此拍卖订单中依照时间排列的序号。
        bytes Priceinuint;
        bytes Quantity;
    }

    struct BidderInfo {
        address Bidder_Address; // Bidder_Address：买方地址。
        bytes32 Bidder_Publickey; // Bidder_publickey：买方公钥。
    }

    modifier AddressMatchesPublickey(bytes32 _publickey, address _address) {
        // 用于检查公钥与地址匹配性的修饰符。
        require(
            _address == address(uint160(uint256(keccak256(abi.encodePacked(_publickey))))),
            "Public key and address are mismatched."
        );
        _;
    }

    modifier onlyOwner_self() {
        // 判断是否由卖方本人直接调用。
        require(msg.sender == _owner, "You are not the creator of this auction contract.");
        _;
    }

    modifier forbidOwner() {
        // 防止卖方本人直接或间接调用的修饰符，主要用于避免卖方对报价环节的干涉。
        require(tx.origin != _owner, "The creator himself should not interfere in the procedure of bidding.");
        _;
    }

    modifier onlyOwner_center() {
        // 判断是否由卖方本人通过中心合约进行调用。
        require(
            tx.origin == _owner && msg.sender == address_auctioncall,
            "You are not the creator of this auction contract."
        );
        _;
    }

    modifier AuctionOn() {
        // 用于检查拍卖订单是否处于报价进行环节。该修饰符主要用于买方报价或撤销报价时检查其操作合法性，只有在拍卖未截止时（即报价进行环节）买方才能进行以上操作；
        // !!!!!!!需要注意!!!!!!!，此修饰符未设置错误触发，因此买方若在拍卖截止后调用与此修饰符修饰的函数时不会产生回滚，因而可能存在少量损失；建议买方在客户端严格跟踪拍卖订单的截止时间，避免错误调用。
        // 此处为设置触发的解释如下：拍卖停止接收报价的判断——即全局变量auction_state的修改需要通过外部调用才能触发，如果仅通过auction_state本身作为修饰条件则会因为修改延迟的问题带来不合法报价操作的隐患。
        // 在本合约中有四种渠道触发auction_state的修改：
        // 1、卖方根据全局变量Deadline，及时调用FindWinner进行锁价，这是因为FindWinner将以AuctionOff来修饰，在拍卖截止时间确实已经达到的前提下能够安全修改全局变量auction_state；
        // 2、卖方撤回订单，则auction_state自然安全地修改为false；
        // 3、对isAuctioninProgress函数的调用可以通过查询的方式修改auction_state；
        // 4、买方在拍卖截止时间确实已经达到的前提下，在以上三种情况未发生时进行违规的报价或撤销报价操作，此时auction_state的修改必须要被动触发，以防状态修改延迟带来的不合法操作。
        // 在auction_state被动触发的意义下，无法通过回滚来触发错误，否则状态修改失败。
        // 如果通过报错的方式回滚，虽然此时买方的违规操作仍然无法实现，但是auction_state仍可读为true，这对于其它买方可能会产生信息误导；而不回滚带来的调用损失可以视作是对买方违规操作的惩罚。
        CheckState();
        if (currentstate == auction_state.on) {
            _;
        } else {
            return;
        }
    }

    modifier AuctionClosed() {
        // 用于检查拍卖订单是否已经截止，如果确实超过了截止时间，则auction_state修改为false，此时本合约不再接受新的订单。
        CheckState();
        if (currentstate == auction_state.closed) {
            _;
        } else {
            return;
        }
    }

    modifier AuctionFinished() {
        // 用于检查拍卖订单是否已经截止，如果确实超过了截止时间，则auction_state修改为false，此时本合约不再接受新的订单。
        CheckState();
        if (currentstate == auction_state.finished) {
            _;
        } else {
            return;
        }
    }

    modifier OutsourceImmutability() {
        // 用于检查调用者与交易来源是否一致，此方法用于防止外包合约的攻击，在该修饰符下，函数调用必须直接由外部账户来进行，不能够通过合约来间接调用。
        require(msg.sender == tx.origin, "You are not an external account in Ethereum.");
        _;
    }
}
