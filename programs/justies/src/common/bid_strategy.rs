use crate::admin::GlobalStates;
use crate::auction::{Auction, AuctionBid};
use crate::common::auction_strategy::AuctionStrategy;
use crate::common::cpi_utils::{
  close_token_account_with_signer, transfer_token,
};
use crate::common::{index_pubkey, JustiesErrorCode, PubkeyIndexPage};
use crate::program::Justies;
use anchor_lang::prelude::*;
use anchor_lang::{Key, ToAccountInfo};
use anchor_spl::token::{Token, TokenAccount};
use std::cmp;

// Business logic on bidding.
pub struct BidStrategy<'accounts, 'info> {
  pub bid: &'accounts mut Account<'info, AuctionBid>,
  pub bid_index_info: Option<AccountInfo<'info>>,
  pub auction_strategy: AuctionStrategy<'accounts, 'info>,
  pub bidder: &'accounts Signer<'info>,
  pub bid_amount: u64,
  pub max_allowed_bid_amount: u64,
  pub current_timestamp: i64,
  pub newly_initialized: bool,
  // For the ease of seed calculation.
  pub auction_key: Pubkey,
  pub bidder_key: Pubkey,
  pub bid_bump_bytes: [u8; 1],
}

impl<'accounts, 'info> BidStrategy<'accounts, 'info> {
  pub fn new(
    bid: &'accounts mut Account<'info, AuctionBid>,
    auction: &'accounts mut Account<'info, Auction>,
    bid_index_info: Option<AccountInfo<'info>>,
    bidder: &'accounts Signer<'info>,
    global_states: &'accounts mut Account<'info, GlobalStates>,
    bid_amount: u64,
    max_allowed_bid_amount: u64,
    current_timestamp: i64,
  ) -> Self {
    let auction_key = auction.key();
    let bidder_key = bidder.key();
    let bid_bump_bytes = bid.bump.to_le_bytes();
    Self {
      bid,
      bid_index_info,
      auction_strategy: AuctionStrategy::new(auction, global_states),
      bidder,
      newly_initialized: false,
      bid_amount,
      max_allowed_bid_amount,
      current_timestamp,
      auction_key,
      bidder_key,
      bid_bump_bytes,
    }
  }
  pub fn validate_bid(
    &self,
    bid_escrow_token_account: &Account<TokenAccount>,
    bidder_token_account: &Account<TokenAccount>,
  ) -> Result<()> {
    let auction = &self.auction_strategy.auction;
    let top_bid = auction.top_bid;
    // Bid on ended auction;
    if self.auction_strategy.is_ended(self.current_timestamp) {
      return err!(JustiesErrorCode::BidOnEndedAuction);
    }

    if self.auction_strategy.is_cancelled() {
      return err!(JustiesErrorCode::AuctionCancelled);
    }

    if self.bid_amount == 0 || self.bid_amount > self.max_allowed_bid_amount {
      return err!(JustiesErrorCode::InvalidBidAmount);
    }

    // Bid amount less than the start bid;
    if self.bid_amount < auction.start_bid {
      return err!(JustiesErrorCode::NotMetStartBid);
    }

    // Minimum outbid rate isn't met;
    if self.max_allowed_bid_amount <= top_bid {
      return err!(JustiesErrorCode::NotMetMinOutbidRate);
    }

    if top_bid > 0 {
      let min_eligible_bid = self.auction_strategy.get_min_eligible_bid();
      if self.max_allowed_bid_amount < min_eligible_bid {
        return err!(JustiesErrorCode::NotMetMinOutbidRate);
      }
    }

    // Insufficient bid funds.
    //
    // Note that when running here, the actual bid has to be greater than the
    // the previous bid (if any), so the net transfer amount has to be positive.
    let transfer_amount = self.get_transfer_amount(bid_escrow_token_account);
    if transfer_amount > bidder_token_account.amount {
      return err!(JustiesErrorCode::InsufficientBidFunds);
    }

    Ok(())
  }

  pub fn get_bid_escrow_signer_seed(&self) -> Box<Vec<&[u8]>> {
    Box::new(vec![
      b"auction".as_ref(),
      self.auction_key.as_ref(),
      b"bid".as_ref(),
      self.bidder_key.as_ref(),
      self.bid_bump_bytes.as_ref(),
    ])
  }

  // Only called after validation, which means when being called, the actual bid
  // has to be greater than the the previous bid (if any), so the net transfer
  // amount has to be positive.
  pub fn get_transfer_amount(
    &self,
    bid_escrow_token_account: &Account<TokenAccount>,
  ) -> u64 {
    return self.get_actual_bid() - bid_escrow_token_account.amount;
  }

  pub fn get_actual_bid(&self) -> u64 {
    cmp::max(
      self.bid_amount,
      self.auction_strategy.get_min_eligible_bid(),
    )
  }

  // Only called after validation.
  pub fn set_bid_account_data(&mut self, bid_bump: u8) {
    let actual_bid = self.get_actual_bid();
    let auction = &mut self.auction_strategy.auction;
    let bid = &mut self.bid;
    self.newly_initialized = !bid.initialized;
    if !bid.initialized {
      bid.initialized = true;
      bid.bump = bid_bump;
      bid.auction = auction.key();
      bid.bidder = self.bidder.key();
    }
    bid.bid = actual_bid;
    bid.latest_change_timestamp = self.current_timestamp;
  }

  pub fn make_bid(&mut self) {
    let auction = &mut self.auction_strategy.auction;
    if self.newly_initialized {
      auction.total_bids += 1;
    }
    auction.top_bid = self.bid.bid;
    auction.top_bidder = Some(self.bidder.key());

    if self.auction_strategy.need_to_extend(self.current_timestamp) {
      self.auction_strategy.extend(self.current_timestamp);
    }
  }

  pub fn cancel_bid(&mut self) {
    self.bid.bid = 0;
    self.bid.latest_change_timestamp = self.current_timestamp;
    if self.auction_strategy.is_ended(self.current_timestamp) {
      self.auction_strategy.finalize_auction_if_need();
    }
  }

  // The implementation of a race-condition free bids key indexing.
  // All bids are iterable without introducing race-conditions for making bids.
  pub fn try_index_bid(
    &mut self,
    bid_index_bump: u8,
    justies_program: &Program<'info, Justies>,
    system_program: &Program<'info, System>,
  ) -> Result<()> {
    // Only save for newly-created bid account (i.e.: for the new bidder);
    if !self.newly_initialized {
      return Ok(());
    }

    let page_id = PubkeyIndexPage::page_id(
      self.auction_strategy.auction.total_bids,
      self.auction_strategy.global_states.num_keys_per_index_page,
    );
    let page_id_bytes = page_id.to_le_bytes();
    let bid_index_bump_bytes = bid_index_bump.to_le_bytes();
    let signer_seed = vec![
      b"auction".as_ref(),
      self.auction_key.as_ref(),
      b"bid_index".as_ref(),
      page_id_bytes.as_ref(),
      bid_index_bump_bytes.as_ref(),
    ];

    index_pubkey(
      self.bid.to_account_info().key(),
      bid_index_bump,
      signer_seed.as_slice(),
      self.bid_index_info.as_ref().unwrap().clone(),
      self.bidder.to_account_info(),
      justies_program.to_account_info(),
      system_program.to_account_info(),
    )?;
    Ok(())
  }

  pub fn transfer_bid_funds(
    &self,
    token_program: &'accounts Program<'info, Token>,
    bidder_token_account: &'accounts Account<'info, TokenAccount>,
    bid_escrow_token_account: &'accounts Account<'info, TokenAccount>,
  ) -> Result<()> {
    let transfer_amount = self.get_transfer_amount(bid_escrow_token_account);
    transfer_token(
      token_program,
      bidder_token_account,
      bid_escrow_token_account,
      self.bidder.to_account_info(),
      transfer_amount,
      None,
    )?;

    Ok(())
  }

  pub fn refund(
    &mut self,
    token_program: &Program<'info, Token>,
    bid_escrow_token_account: &Account<'info, TokenAccount>,
    bidder_token_account: &Account<'info, TokenAccount>,
  ) -> Result<()> {
    transfer_token(
      token_program,
      bid_escrow_token_account,
      bidder_token_account,
      self.bid.to_account_info(),
      bid_escrow_token_account.amount,
      Some(self.get_bid_escrow_signer_seed().as_ref()),
    )?;
    Ok(())
  }

  pub fn close_bid_escrow_token_account(
    &mut self,
    token_program: &Program<'info, Token>,
    bid_escrow_token_account: &mut Account<'info, TokenAccount>,
  ) -> Result<()> {
    close_token_account_with_signer(
      token_program,
      bid_escrow_token_account,
      self.bidder.to_account_info(),
      self.bid.to_account_info(),
      self.get_bid_escrow_signer_seed().as_ref(),
    )?;

    Ok(())
  }
}
