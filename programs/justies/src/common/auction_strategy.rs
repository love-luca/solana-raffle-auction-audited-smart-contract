use crate::admin::GlobalStates;
use crate::auction::Auction;
use anchor_lang::prelude::*;
use anchor_lang::ToAccountInfo;
use anchor_spl::token::{Token, TokenAccount};

use crate::common::cpi_utils::{
  close_token_account_with_signer, transfer_token,
};
use crate::common::{
  JustiesErrorCode, GroupConfig, ListingStatus, RevenueShareConfig,
};

// Business logic on auction.
pub struct AuctionStrategy<'accounts, 'info> {
  pub auction: &'accounts mut Account<'info, Auction>,
  pub global_states: &'accounts mut Account<'info, GlobalStates>,
  // This is for the ease of calculating seeds.
  pub auction_id_bytes: [u8; 8],
  pub auction_bump_bytes: [u8; 1],
}

impl<'accounts, 'info> AuctionStrategy<'accounts, 'info> {
  pub fn new(
    auction: &'accounts mut Account<'info, Auction>,
    global_states: &'accounts mut Account<'info, GlobalStates>,
  ) -> Self {
    let auction_id_bytes = auction.id.to_le_bytes();
    let auction_bump_bytes = auction.bump.to_le_bytes();
    Self {
      auction,
      global_states,
      auction_id_bytes,
      auction_bump_bytes,
    }
  }

  pub fn init_auction(
    &mut self,
    id: u64,
    bump: u8,
    nft_mint_address: Pubkey,
    currency_token_mint_address: Pubkey,
    creator_address: Pubkey,
    duration: i64,
    start_bid: u64,
    eligible_groups: &Vec<GroupConfig>,
    revenue_shares: &Vec<RevenueShareConfig>,
    current_timestamp: i64,
  ) -> Result<()> {
    if (duration as u64) < self.global_states.min_auction_duration
      || (duration as u64) > self.global_states.max_auction_duration
    {
      return err!(JustiesErrorCode::InvalidAuctionDuration);
    }

    self.global_states.total_auctions += 1;
    self.auction.bump = bump;
    self.auction.id = id;
    self.auction.nft_mint_address = nft_mint_address;
    self.auction.currency_token_mint_address = currency_token_mint_address;
    self.auction.created_timestamp = current_timestamp;
    self.auction.expired_timestamp = self.auction.created_timestamp + duration;
    self.auction.start_bid = start_bid;
    self.auction.creator = creator_address;
    self.auction.eligible_groups = eligible_groups.clone();
    self.auction.revenue_shares = revenue_shares.clone();
    self.auction.status = ListingStatus::InProgress;
    self.auction.total_bids = 0;
    self.auction.top_bid = 0;
    self.auction.top_bidder = None;
    Ok(())
  }

  pub fn deposit_nft(
    &mut self,
    token_program: &Program<'info, Token>,
    creator_nft_account: &Account<'info, TokenAccount>,
    escrow_nft_account: &Account<'info, TokenAccount>,
    creator: AccountInfo<'info>,
  ) -> Result<()> {
    transfer_token(
      token_program,
      creator_nft_account,
      escrow_nft_account,
      creator,
      1,
      None,
    )?;
    Ok(())
  }

  pub fn is_ended(&self, current_timestamp: i64) -> bool {
    return current_timestamp > self.auction.expired_timestamp;
  }

  pub fn is_cancelled(&self) -> bool {
    return self.auction.status == ListingStatus::Cancelled;
  }

  pub fn need_to_extend(&self, current_timestamp: i64) -> bool {
    return current_timestamp
      > self.auction.expired_timestamp
        - (self.global_states.last_minutes_for_auction_extend as i64) * 60;
  }

  pub fn get_min_eligible_bid(&self) -> u64 {
    let top_bid = self.auction.top_bid as i64;
    let min_outbid_rate_bps = self.global_states.min_outbid_rate_bps as i64;
    (top_bid + top_bid * min_outbid_rate_bps / 10000) as u64
  }

  pub fn extend(&mut self, current_timestamp: i64) {
    self.auction.expired_timestamp = current_timestamp
      + (self.global_states.auction_extend_minutes as i64) * 60;
  }

  pub fn cancel(&mut self) {
    self.auction.status = ListingStatus::Cancelled;
  }

  pub fn get_lot_escrow_signer_seed(&self) -> Box<Vec<&[u8]>> {
    Box::new(vec![
      b"auction".as_ref(),
      self.auction_id_bytes.as_ref(),
      self.auction_bump_bytes.as_ref(),
    ])
  }

  pub fn transfer_lot_nft(
    &mut self,
    token_program: &Program<'info, Token>,
    escrow_nft_account: &Account<'info, TokenAccount>,
    target_nft_account: &Account<'info, TokenAccount>,
  ) -> Result<()> {
    transfer_token(
      token_program,
      escrow_nft_account,
      target_nft_account,
      self.auction.to_account_info(),
      1,
      Some(self.get_lot_escrow_signer_seed().as_ref()),
    )?;
    Ok(())
  }

  pub fn close_lot_escrow_nft_account(
    &mut self,
    token_program: &Program<'info, Token>,
    lot_escrow_nft_account: &mut Account<'info, TokenAccount>,
    auction_creator: &AccountInfo<'info>,
  ) -> Result<()> {
    close_token_account_with_signer(
      token_program,
      lot_escrow_nft_account,
      auction_creator.clone(),
      self.auction.to_account_info(),
      self.get_lot_escrow_signer_seed().as_ref(),
    )?;
    Ok(())
  }

  pub fn finalize_auction_if_need(&mut self) {
    if self.auction.status != ListingStatus::Finished {
      self.auction.status = ListingStatus::Finished;
    }
  }
}
