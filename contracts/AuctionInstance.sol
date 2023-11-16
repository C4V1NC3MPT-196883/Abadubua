// SPDX-License-Identifier: UNLICENCED
pragma solidity >=0.8.0 <0.9.0;

import "./AuctionCall.sol";
import "fhevm/lib/TFHE.sol";

contract AuctionInstance {
    // 本合约用于构造拍卖订单的实例，卖方向中心（以./AuctionCall.sol为中心合约）传递订单相关参数后创建本合约。
    // 本合约创建后，买方只与本合约交互，进行报价、撤回报价等操作；报价时间截止后卖方进行报价锁定以及密文比价，最终获得拍卖结果。
    OrderDetail public orderdetail; // 全局变量orderdetail：用于存储买方可见的订单细节。
    address _owner; // 全局变量_owner：用于指示卖方地址。
    address address_auctioncall; // 全局变量address_auctioncall：用于指示中心合约地址。
    bool auction_state = true; // 全局变量auction_state：用于表示拍卖是否进行中；拍卖订单创建时自动设置为“true”，拍卖报价时间截止或拍卖订单被卖方撤回时将变为“false”。
    bool auction_retracted = false; // 全局变量auction_retracted：用于表示拍卖是否已被撤回；拍卖订单创建时默认为“false”，卖方撤回拍卖订单时将变为“false”。

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

    struct ExtractedFinal {
        //定义结构体ExtractedFinal：在密文比价中需要对报价信息进行线性化，通过此结构体进行线性化密文的记录。
        euint8 Bidder_Cindex; // Bidder_Cindex：报价者在此拍卖订单中依照时间排列的序号。
        euint32 Linearized_Ciphertext; // Linearized_Ciphertext：线性化后的密文。
    }

    struct TopBidder4seller {
        // 定义结构体TopBidder4seller：用于记录以卖方公钥重加密后的头部报价密文。
        bytes Bidder_index; // Bidder_index：报价者在此拍卖订单中依照时间排列的序号。
        bytes Linearized_Ciphertext; // Linearized_Ciphertext：线性化后的密文。
    }

    constructor(OrderDetail memory _orderdetail) {
        // 合约构造函数，通过./AuctionCall.sol的CreateNewAuction函数中传递的参数_orderdetail来创建拍卖订单。
        orderdetail = _orderdetail; // 将参数_orderdetail写入全局变量orderdetail，记录订单可视细节。
        address_auctioncall = msg.sender; // 将创建此合约的地址（即CreateNewAuction所在的实例合约）写入全局变量address_auctioncall，作为本合约的中心合约地址。
        _owner = tx.origin; // 将CreateNewAuction的调用者地址写入全局变量_owner，作为本合约的创建者，即拍卖订单的卖方。
    }

    function owner() public view returns (address) {
        // 获取拍卖订单的卖方地址。
        return _owner;
    }

    function isOwner_general(address someaddress) public view returns (bool) {
        // 判断给定地址是否为拍卖订单的卖方。
        return _owner == someaddress;
    }

    function isOwner_self() internal view returns (bool) {
        // 判断是否由卖方本人直接调用。
        return msg.sender == _owner;
    }

    function isOwner_center() internal view returns (bool) {
        // 判断是否由卖方本人通过中心合约进行调用。
        return tx.origin == _owner && msg.sender == address_auctioncall;
    }

    modifier onlyOwner_self() {
        // isOwner_self直接对应的修饰符。
        require(isOwner_self(), "You are not the creator of this auction contract.");
        _;
    }

    modifier forbidOwner() {
        // 防止卖方本人直接或间接调用的修饰符，主要用于避免卖方对报价环节的干涉。
        require(tx.origin != _owner, "The creator himself should not interfere in the procedure of bidding.");
        _;
    }

    modifier onlyOwner_center() {
        // isOwner_center直接对应的修饰符。
        require(isOwner_center(), "You are not the creator of this auction contract.");
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
        if (block.timestamp > orderdetail.Deadline) {
            auction_state = false;
            return;
        } else {
            _;
        }
    }

    modifier AuctionOff() {
        // 用于检查拍卖订单是否已经截止，如果确实超过了截止时间，则auction_state修改为false，此时本合约不再接受新的订单。
        require(block.timestamp <= orderdetail.Deadline, "The auction is still accepting biddings.");
        auction_state = false;
        _;
    }

    modifier OutsourseImmutability() {
        // 用于检查调用者与交易来源是否一致，此方法用于防止外包合约的攻击，在该修饰符下，函数调用必须直接由外部账户来进行，不能够通过合约来间接调用。
        require(msg.sender == tx.origin, "You are not an external account in Ethereum.");
        _;
    }

    function isAuctioninProgress() public returns (bool) {
        // 用于查询当前拍卖订单是否在进行中/是否接受报价。
        if (block.timestamp > orderdetail.Deadline) {
            auction_state = false;
        }
        return auction_state;
    }

    function RetractMyAuction() public onlyOwner_center {
        // 卖方撤回本合约代表的拍卖，此方法只能由卖方通过中心合约的RetractAuction进行消息调用。
        auction_state = false;
        auction_retracted = true;
    }

    modifier normalfunctioned() {
        require(!auction_retracted, "The auction has been retracted.");
        _;
    }
    ///////////////////////////////////////////////////////////////////////////////////////
    //报价环节
    ///////////////////////////////////////////////////////////////////////////////////////

    mapping(address => Bidding) Biddinglist; // 定义Biddinglist用于报价环节中买方报价状态的更新。
    address[] BiddingAddress; // 定义BiddingAddress用于存储与拍卖订单交互的买方地址，与Biddinglist配合便于锁价后对所有待排序订单的预处理。

    function RaiseBidding(
        // 买方调用的核心函数，用于发起报价。RaiseBidding接受序列化的密文bytes作为参数，包括单位报价和认领数量。
        // 函数具有四个修饰符，分别表征函数需要在拍卖未截止、不经过外包调用、非卖方本人调用以及拍卖未撤回的前提下才能被调用。
        bytes calldata _priceinunit,
        bytes calldata _quantity
    ) external AuctionOn OutsourseImmutability forbidOwner normalfunctioned {
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
            BiddingAddress.push(msg.sender);
        }
        Biddinglist[msg.sender] = Bidding(epriceinunit, equantity, block.timestamp, true);
        // 将上述转化后的满足报价条件的买方报价信息存储至Biddinglist中，如果买方此前已有报价，则可以通过此方法覆盖，Biddinglist中只会记录一个关于该买方的报价信息。
    }

    function RetractBidding() external AuctionOn OutsourseImmutability forbidOwner normalfunctioned {
        // 修饰符功能如前，买方通过调用该函数对Biddinglist中记录的报价进行撤销。
        // 注意到Biddinglist对任一地址只能同时存在一个报价信息，因此撤回时只需初始化报价时间，后续考察有效报价时通过筛选报价时间的条件即可。
        Biddinglist[msg.sender].Liveness = false;
        Biddinglist[msg.sender].Bidding_Time = 0;
    }

    ///////////////////////////////////////////////////////////////////////////////////////
    //锁价计算环节
    ///////////////////////////////////////////////////////////////////////////////////////

    function CipherLinearization(Bidding memory bidding) private pure returns (euint32) {
        // 定义一个私有函数，用于将报价信息中的多属性密文转化为线性化后的密文，将优先级较高的属性放置到高位时需要对低位属性的长度进行扩展补偿，此处设置低位的数量属性补偿为16位。
        euint32 conpensatedprice = TFHE.mul(bidding.PriceInUnit, TFHE.asEuint32(2 ^ 16)); // 将买方单位报价平移16位至高位。
        return TFHE.add(conpensatedprice, bidding.Quantity);
    }

    function List_Sorting(address[] memory biddingaddress) private view returns (address[] memory) {
        // 定义一个私有函数，用于对BiddingAddress中出现的买方地址进行排序，排序的标准是买方地址在Biddinglist映射中对应的报价时间。
        // 依据报价时间排序，能够保证以该顺序将BiddingAddress中的买方地址自然地以时间优先顺序替换SortedFinalBiddings中的元素，相当于在线性化比较的外部已经提前实现了明文时间的排序。
        // List_Sorting在完成排序后会将所有撤回订单的买方地址（对应Bidding_Time为0的地址）删除，剩下的买方地址都对应了有效报价，这些有效报价将进一步进行线性化密文报价信息的排序。
        uint lengthoflist = biddingaddress.length;
        uint nullindex = lengthoflist; // 定义nullindex作为标记位来记录排序后最大的对应Bidding_Time为0的地址，方便后续将nullindex之前（包含）的所有买方地址删除。初始化为不在列表中的最小位置。
        for (uint i = 0; i < lengthoflist - 1; i++) {
            // 关于明文报价时间的属性进行选择排序。
            uint flagindex = i; // 定义flagindex作为选择排序的临时标记位，用于记录未排序元素中对应Bidding_Time最小的地址位置。
            for (uint j = i + 1; j < lengthoflist - 2; j++) {
                // 未排序的元素从第j + 1个位置开始。
                if (Biddinglist[biddingaddress[j]].Bidding_Time < Biddinglist[biddingaddress[flagindex]].Bidding_Time) {
                    flagindex = j; // 更新当前已检查到的未排序元素中对应Bidding_Time最小的地址位置。
                }
            }
            if (flagindex != i) {
                // 只有flagindex与i位置不同时（即存在比第i个位置对应的Bidding_Time小的未排序元素）才进行交换。
                (biddingaddress[i], biddingaddress[flagindex]) = (biddingaddress[flagindex], biddingaddress[i]);
            }
            if (Biddinglist[biddingaddress[i]].Bidding_Time == 0) {
                // 交换后，检查被交换的对应Bidding_Time最小项是否为0，若为0，则更新nullindex；这表明到目前为止nullindex之前（包含）的所有买方地址都对应无效报价。
                nullindex = i;
            }
        }
        if (nullindex != lengthoflist) {
            // nullindex != lengthoflist，表明至少存在一个买方地址对应无效报价。
            address[] memory supportbiddingaddress = new address[](lengthoflist - nullindex - 1);
            for (uint k = 0; k < lengthoflist - nullindex - 1; k++) {
                supportbiddingaddress[k] = biddingaddress[k + nullindex + 1];
            }
            return supportbiddingaddress;
        } else {
            // nullindex == lengthoflist，表明所有买方地址都对应有效报价，此时直接返回已排序的BiddingAddress。
            return biddingaddress;
        }
    }

    function FindWinner(
        bytes32 publicKey4owner
    ) public onlyOwner_self AuctionOff normalfunctioned returns (TopBidder4seller[] memory, address[] memory) {
        // 卖方锁价并执行密文比价得到拍卖结果的核心函数，要求只有卖方本人能够发起锁价，并且此时拍卖已经截止且未被撤回该函数执行的主要原理如下：
        // 1、由拍卖订单信息计算订单最大分拆数TrunctionNumber，初始化一个长度为TrunctionNumber的数组SortedFinalBiddings；
        // 2、对BiddingAddress调用List_Sorting进行排序，此时BiddingAddress中的买方地址将按照对应Bidding_Time的顺序按优先级排序，且每个买方地址都对应有效报价;
        // 3、依次（由List_Sorting的排列）将BiddingAddress中出现的买方地址取出，在Biddinglist映射中读取密文报价信息，将该信息整合为线性化密文；
        // 4、将取出的线性化密文依次与已排序的线性化密文比较，通过cmux方法依照密文比较结果更新SortedFinalBiddings;
        // 5、SortedFinalBiddings排序完成后，将其各项密文重加密为卖方可解密的密文，并将BiddingAddress的结果返回给卖方供其解密Bidder_index的参考。
        uint8 TrunctionNumber = uint8(orderdetail.Quantity / orderdetail.Minimalsplit); // 计算订单最大分拆数TrunctionNumber。
        BiddingAddress = List_Sorting(BiddingAddress); // 调用List_Sorting对BiddingAddress进行（依照Bidding_Time）的排序和无效订单的过滤。
        if (TrunctionNumber > BiddingAddress.length) {///////!!!!!!!!!此处临时设置一个补救措施，后续可以再考虑更好的解决方案。
            auction_state = true; 
            orderdetail.Deadline = orderdetail.Deadline + 86400;
        }
        ExtractedFinal[] memory SortedFinalBiddings = new ExtractedFinal[](TrunctionNumber);
        for (uint8 i = 0; i < TrunctionNumber; i++) {
            // 初始化SortedFinalBiddings，长度为TrunctionNumber，初始化的Linearized_Ciphertext为0的密文（最小值）。
            SortedFinalBiddings[i] = ExtractedFinal(TFHE.asEuint8(0), TFHE.asEuint32(0));
        }
        for (uint j = 0; j < BiddingAddress.length; j++) {
            // 依次取出BiddingAddress中的买方地址进行线性化密文的比较。
            Bidding memory currentbidding = Biddinglist[BiddingAddress[j]]; // 读取买方地址对应的拍卖订单信息，注意到买方地址一定对应Biddinglist中的有效报价。
            euint32 currentlinearizedbidding = CipherLinearization(currentbidding); // 通过当前读取的拍卖订单信息计算线性化密文。
            ebool[] memory SortConditions = new ebool[](TrunctionNumber + 1); // 初始化一个临时密文条件数组，记录密文比较结果，最后一个元素为false（即线性化密文一定不会和最后一个元素交换）。
            for (uint k = 0; k < TrunctionNumber; k++) {
                // 依次将取出的线性化密文依次与已排序的线性化密文比较，通过cmux方法依照密文比较结果更新SortedFinalBiddings。
                SortConditions[k] = TFHE.gt(currentlinearizedbidding, SortedFinalBiddings[k].Linearized_Ciphertext);
            }
            SortConditions[TrunctionNumber] = TFHE.asEbool(false); // 最后一个元素为false（即线性化密文一定不会和最后一个元素交换）。
            for (uint t = 0; t < TrunctionNumber; t++) {
                // 根据SortConditions中的密文比较结果更新SortedFinalBiddings。
                ExtractedFinal memory currentprocessing = SortedFinalBiddings[t]; // 取出SortedFinalBiddings中的当前密文，
                SortedFinalBiddings[t] = ExtractedFinal(
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
        TopBidder4seller[] memory SortedTopBidders4seller = new TopBidder4seller[](TrunctionNumber); // 初始化TopBidder4seller数组SortedTopBidders4seller，用于记录最后的密文结果。
        for (uint l = 0; l < TrunctionNumber; l++) { // 将重加密的结果按顺序添加到SortedTopBidders4seller中。
            SortedTopBidders4seller[l] = TopBidder4seller(
                TFHE.reencrypt(SortedFinalBiddings[l].Bidder_Cindex, publicKey4owner),
                TFHE.reencrypt(SortedFinalBiddings[l].Linearized_Ciphertext, publicKey4owner)
            );
        }
        return (SortedTopBidders4seller, BiddingAddress);
        // 返回值第二项是为了便于卖方解密Bidder_index后通过BiddingAddress将对应买方的地址取出，这是因为构造Bidder_Cindex时是从BiddingAddress的序号来标记买方地址的。
        // BiddingAddress也可以从全局变量中读取。
        // 卖方解密SortedTopBidders4seller中的Linearized_Ciphertext后还需在客户端将线性化明文解析为明文的单位报价以及认领数量。
    }
}
