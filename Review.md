# Solana Auction/Raffle Review Report

# Summary
This is the auction/raffle smart contract.
It is well-structured code with admin, common, auction, and raffle folders and lib.rs file.

This lib.rs file represents the whole instructions for Admin, Auction and Raffle functionalities.

The files in raffle folder represent the individual instruction's context and instruction handler.

# In scope


# Findings
In total, issues were reported including:
- 5 High severity issues
- 2 Medium severity issues
- 6 Low severity issues
- 3 Informal severity issues

# Severity Issues
## 1. Decimal mismatch.
<b>Severity: high</b>

<b>Description</b>

To initialize account, in the `CreateRaffle<'info>` context, you set the space as `8 + TicketPositionStats::INIT_DATA_SIZE`.
But here is the TicketPositionStats account structure:


```ps
Auction.auctionEnd() (line#92-99)
  uint256 totalRaisedUSD = totalUSDT + totalBNB * bnbPrice;(line#97)
```

For example: 
```