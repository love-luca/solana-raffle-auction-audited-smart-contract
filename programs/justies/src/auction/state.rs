use crate::common::types::{GroupConfig, ListingStatus, RevenueShareConfig};
use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct Auction {
  pub bump: u8,
  pub id: u64,
  pub nft_mint_address: Pubkey,
  pub currency_token_mint_address: Pubkey,
  pub created_timestamp: i64,
  pub expired_timestamp: i64,
  pub start_bid: u64,
  pub creator: Pubkey,
  // The address to the eligible group config (e.g.: NFT holder, clubs, etc).
  // There can have multiple group configs (conjoined with OR operator).
  // When empty, all users can make the bid.
  pub eligible_groups: Vec<GroupConfig>,
  // A vector that denotes the after-fee revenue shares among multiple wallets. Constraints:
  // - Each element is a pair: the wallet address and the share in bps (1 bps == 0.01%);
  // - Revenue can be shared among maximum 10 wallets;
  // - The sum of all the revenue share bps has to be 10000 (10000 bps == 100%).
  pub revenue_shares: Vec<RevenueShareConfig>,
  pub status: ListingStatus,
  // The total number of bids ever created (includes both the active and
  // cancelled bids)
  pub total_bids: u64,
  pub top_bid: u64,
  pub top_bidder: Option<Pubkey>,
}

impl Auction {
  pub const MIN_DURATION: u64 = 6 * 3600;
  pub const MAX_DURATION: u64 = 7 * 24 * 3600;
  pub const MAX_DATA_SIZE: usize = (1
    + 8
    + 32
    + 32
    + 8
    + 8
    + 8
    + 32
    + (4 + GroupConfig::MAX_GROUP_CONFIGS * GroupConfig::MAX_DATA_SIZE)
    + (4
      + RevenueShareConfig::MAX_REVENUE_RECEIVERS
        * RevenueShareConfig::MAX_DATA_SIZE)
    + 4
    + 8
    + 8
    + (1 + 32));
}

#[account]
#[derive(Default)]
pub struct AuctionBid {
  pub bump: u8,
  pub initialized: bool,
  pub auction: Pubkey,
  pub bidder: Pubkey,
  // The bid amount could be 0 when it is cancelled.
  pub bid: u64,
  pub latest_change_timestamp: i64,
}

impl AuctionBid {
  pub const MAX_DATA_SIZE: usize = (1 + 1 + 32 + 32 + 8 + 8);
}
