use crate::common::types::{GroupConfig, ListingStatus, RevenueShareConfig};
use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct Raffle {
  pub bump: u8,
  pub id: u64,
  pub nft_mint_address: Pubkey,
  pub num_raffled_nfts: u8,
  pub num_ticket_positions: u16,
  pub currency_token_mint_address: Pubkey,
  pub created_timestamp: i64,
  pub expired_timestamp: i64,
  pub ticket_supply: u16,
  pub ticket_price: u64,
  pub ticket_sold: u16,
  pub creator: Pubkey,
  // Check the doc string of Auction.
  pub eligible_groups: Vec<GroupConfig>,
  // Check the doc string of Auction.
  pub revenue_shares: Vec<RevenueShareConfig>,
  pub status: ListingStatus,
  // The winner ids (by default each winner can only win 1 nft).
  pub winner_ids: Vec<u16>,
  pub claim_mask: u64,
}

impl Raffle {
  pub const MAX_RAFFLED_NFTS: u8 = 15;
  pub const MIN_RAFFLE_TICKETS_SUPPLY: u16 = 30;
  pub const MAX_RAFFLE_TICKETS_SUPPLY: u16 = 3000;
  pub const MIN_DURATION: u64 = 6 * 3600;
  pub const MAX_DURATION: u64 = 7 * 24 * 3600;
  pub const MAX_DATA_SIZE: usize = (1
    + 8
    + 32
    + 1
    + 2
    + 32
    + 8
    + 8
    + 2
    + 8
    + 2
    + 32
    + (4 + GroupConfig::MAX_GROUP_CONFIGS * GroupConfig::MAX_DATA_SIZE)
    + (4
      + RevenueShareConfig::MAX_REVENUE_RECEIVERS
        * RevenueShareConfig::MAX_DATA_SIZE)
    + 4
    + (4 + Self::MAX_RAFFLED_NFTS as usize * 2)
    + 8);
}

#[account]
#[derive(Default)]
pub struct RaffleTicketPosition {
  pub bump: u8,
  pub id: u64,
  pub buyer: Pubkey,
  pub total_num_tickets: u16,
  pub last_purchase_timestamp: i64,
}

impl RaffleTicketPosition {
  pub const MAX_DATA_SIZE: usize = (1 + 8 + 32 + 2 + 8);
}

/// The ticket position stats that will be used for on-chain raffle.
#[account]
#[derive(Default)]
pub struct TicketPositionStats {
  pub bump: u8,
  // The summary to the ticket positions (each index correspond to the bid ids).
  pub ticket_positions: Vec<u16>,
}

impl TicketPositionStats {
  pub const INIT_DATA_SIZE: usize = 1 + 4;
  pub fn space(len: usize) -> usize {
    8 + Self::INIT_DATA_SIZE + len * 2
  }
}
