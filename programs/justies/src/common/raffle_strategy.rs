use anchor_lang::prelude::*;
use anchor_lang::Key;
use anchor_lang::ToAccountInfo;
use anchor_spl::token::{Token, TokenAccount};

use crate::admin::GlobalStates;
use crate::common::cpi_utils::{
  close_token_account_with_signer, transfer_token,
};
use crate::common::{
  get_current_timestamp, index_pubkey, pick_winners, resize_account,
  JustiesErrorCode, GroupConfig, ListingStatus, PubkeyIndexPage,
  RevenueShareConfig,
};
use crate::program::Justies;
use crate::raffle::{Raffle, RaffleTicketPosition, TicketPositionStats};

// Business logic for raffle.
pub struct RaffleStrategy<'accounts, 'info> {
  pub raffle: &'accounts mut Account<'info, Raffle>,
  pub global_states: &'accounts mut Account<'info, GlobalStates>,
  pub ticket_position_index_info: Option<AccountInfo<'info>>,
  // For the ease of getting signer seed.
  pub raffle_id_bytes: [u8; 8],
  pub raffle_bump_bytes: [u8; 1],
}

impl<'accounts, 'info> RaffleStrategy<'accounts, 'info> {
  pub fn new(
    raffle: &'accounts mut Account<'info, Raffle>,
    global_states: &'accounts mut Account<'info, GlobalStates>,
    ticket_position_index_info: Option<AccountInfo<'info>>,
  ) -> Self {
    let raffle_id_bytes = raffle.id.to_le_bytes();
    let raffle_bump_bytes = raffle.bump.to_le_bytes();
    Self {
      raffle,
      global_states,
      ticket_position_index_info,
      raffle_id_bytes,
      raffle_bump_bytes,
    }
  }

  pub fn validate_set_winners(&self, current_timestamp: i64) -> Result<()> {
    if self.is_cancelled() {
      return err!(JustiesErrorCode::RaffleCancelled);
    }
    if !self.is_ended(current_timestamp) {
      return err!(JustiesErrorCode::RaffleOngoing);
    }
    Ok(())
  }

  pub fn validate_make_raffle(
    &self,
    current_timestamp: i64,
    rerun: bool,
  ) -> Result<()> {
    if self.is_cancelled() {
      return err!(JustiesErrorCode::RaffleCancelled);
    }
    if !self.is_ended(current_timestamp) {
      return err!(JustiesErrorCode::RaffleOngoing);
    }

    if rerun {
      if !self.global_states.is_test_environment {
        return err!(JustiesErrorCode::NotTestEnvironment);
      }
      return Ok(());
    }

    if self.has_winners() {
      return err!(JustiesErrorCode::RaffleAlreadyMade);
    }
    Ok(())
  }

  pub fn validate_claim_remaining_rewards(&self) -> Result<()> {
    if !self.has_winners() {
      return err!(JustiesErrorCode::RaffleNotMade);
    }
    if self.num_remaining_rewards() == 0 {
      return err!(JustiesErrorCode::NoRemainingRaffleRewards);
    }
    Ok(())
  }

  pub fn is_ended(&self, current_timestamp: i64) -> bool {
    current_timestamp > self.raffle.expired_timestamp
  }

  pub fn is_cancelled(&self) -> bool {
    self.raffle.status == ListingStatus::Cancelled
  }

  pub fn is_raffle_made(&self) -> bool {
    self.raffle.status == ListingStatus::Finished
  }

  pub fn num_remaining_rewards(&self) -> u64 {
    self.raffle.num_raffled_nfts as u64 - self.raffle.winner_ids.len() as u64
  }

  pub fn has_winners(&self) -> bool {
    self.raffle.winner_ids.len() > 0
  }

  fn get_winner_index(&self, ticket_position_id: u64) -> Option<usize> {
    self
      .raffle
      .winner_ids
      .iter()
      .position(|&winner| winner as u64 == ticket_position_id)
  }

  pub fn validate_claim(&self, ticket_position_id: u64) -> Result<()> {
    if !self.is_raffle_made() {
      return err!(JustiesErrorCode::RaffleNotMade);
    }

    let winner_index = self.get_winner_index(ticket_position_id);
    if winner_index == None {
      return err!(JustiesErrorCode::NotARaffleWinner);
    }
    if (self.raffle.claim_mask & (1 << winner_index.unwrap())) > 0 {
      return err!(JustiesErrorCode::RaffleRewardClaimed);
    }

    Ok(())
  }

  pub fn init_raffle(
    &mut self,
    id: u64,
    bump: u8,
    creator: AccountInfo<'info>,
    nft_mint: AccountInfo<'info>,
    num_raffled_nft: u8,
    currency_token_mint: AccountInfo<'info>,
    duration: i64,
    ticket_supply: u16,
    ticket_price: u64,
    eligible_groups: &Vec<GroupConfig>,
    revenue_shares: &Vec<RevenueShareConfig>,
    current_timestamp: i64,
  ) -> Result<()> {
    if (duration as u64) < self.global_states.min_raffle_duration
      || (duration as u64) > self.global_states.max_raffle_duration
    {
      return err!(JustiesErrorCode::InvalidRaffleDuration);
    }

    if num_raffled_nft == 0
      || num_raffled_nft > self.global_states.max_raffled_nfts
    {
      return err!(JustiesErrorCode::InvalidNumRaffledNfts);
    }

    if ticket_supply < self.global_states.min_raffle_ticket_supply
      || ticket_supply > self.global_states.max_raffle_ticket_supply
    {
      return err!(JustiesErrorCode::InvalidRaffleTicketSupply);
    }

    self.global_states.total_raffles += 1;

    self.raffle.id = id;
    self.raffle.bump = bump;
    self.raffle.nft_mint_address = nft_mint.key();
    self.raffle.num_raffled_nfts = num_raffled_nft;
    self.raffle.num_ticket_positions = 0;
    self.raffle.currency_token_mint_address = currency_token_mint.key();
    self.raffle.created_timestamp = current_timestamp;
    self.raffle.expired_timestamp = current_timestamp + duration;
    self.raffle.ticket_supply = ticket_supply;
    self.raffle.ticket_price = ticket_price;
    self.raffle.ticket_sold = 0;
    self.raffle.creator = creator.key();
    self.raffle.eligible_groups = eligible_groups.clone();
    self.raffle.revenue_shares = revenue_shares.clone();
    self.raffle.status = ListingStatus::InProgress;
    self.raffle.winner_ids = vec![];
    self.raffle.claim_mask = 0;
    Ok(())
  }

  pub fn get_raffle_signer_seed(&self) -> Box<Vec<&[u8]>> {
    Box::new(vec![
      b"raffle".as_ref(),
      self.raffle_id_bytes.as_ref(),
      self.raffle_bump_bytes.as_ref(),
    ])
  }

  pub fn deposit_nft(
    &mut self,
    token_program: &'accounts Program<'info, Token>,
    creator_nft_account: &'accounts Account<'info, TokenAccount>,
    escrow_nft_account: &'accounts Account<'info, TokenAccount>,
    creator: AccountInfo<'info>,
  ) -> Result<()> {
    transfer_token(
      token_program,
      creator_nft_account,
      escrow_nft_account,
      creator,
      self.raffle.num_raffled_nfts as u64,
      None,
    )?;
    Ok(())
  }

  pub fn buy_tickets(
    &mut self,
    ticket_position: &'accounts mut Account<'info, RaffleTicketPosition>,
    ticket_position_bump: u8,
    ticket_position_stats: &'accounts mut Account<'info, TicketPositionStats>,
    num_tickets: u16,
    buyer: AccountInfo<'info>,
    current_timestamp: i64,
    system_program: &Program<'info, System>,
  ) -> Result<()> {
    if ticket_position.total_num_tickets != 0 {
      // For existing ticket position, updates the ticket position stats.
      ticket_position_stats.ticket_positions[ticket_position.id as usize] +=
        num_tickets;
    } else {
      // For new ticket position, initialize the ticket position account and
      // adds a new entry to the ticket position stats (with account resizing).
      ticket_position.bump = ticket_position_bump;
      ticket_position.id = self.raffle.num_ticket_positions as u64;
      ticket_position.buyer = buyer.key();
      ticket_position_stats.ticket_positions.push(num_tickets);

      self.raffle.num_ticket_positions += 1;
      resize_account(
        ticket_position_stats.to_account_info(),
        TicketPositionStats::space(self.raffle.num_ticket_positions as usize),
        buyer.clone(),
        system_program.to_account_info(),
      )?;
    }
    ticket_position.total_num_tickets += num_tickets;
    ticket_position.last_purchase_timestamp = current_timestamp;
    self.raffle.ticket_sold += num_tickets;
    Ok(())
  }

  pub fn try_index_ticket_position(
    &mut self,
    ticket_position: &'accounts Account<'info, RaffleTicketPosition>,
    buyer_info: AccountInfo<'info>,
    ticket_position_index_bump: u8,
    justies_program: &Program<'info, Justies>,
    system_program: &Program<'info, System>,
  ) -> Result<()> {
    let newly_initialized = ticket_position.total_num_tickets == 0;
    if !newly_initialized {
      return Ok(());
    }

    let page_id = PubkeyIndexPage::page_id(
      self.raffle.num_ticket_positions.into(),
      self.global_states.num_keys_per_index_page,
    );
    let page_id_bytes = page_id.to_le_bytes();
    let ticket_position_index_bump_bytes =
      ticket_position_index_bump.to_le_bytes();
    let raffle_address = self.raffle.to_account_info().key();
    let signer_seed = vec![
      b"raffle".as_ref(),
      raffle_address.as_ref(),
      b"ticket_position_index".as_ref(),
      page_id_bytes.as_ref(),
      ticket_position_index_bump_bytes.as_ref(),
    ];

    index_pubkey(
      ticket_position.to_account_info().key(),
      ticket_position_index_bump,
      signer_seed.as_slice(),
      self.ticket_position_index_info.as_ref().unwrap().clone(),
      buyer_info,
      justies_program.to_account_info(),
      system_program.to_account_info(),
    )?;
    Ok(())
  }

  pub fn pay_for_tickets(
    &mut self,
    token_program: &'accounts Program<'info, Token>,
    num_tickets: u16,
    buyer_token_account: &'accounts Account<'info, TokenAccount>,
    revenue_escrow_token_account: &'accounts Account<'info, TokenAccount>,
    buyer: AccountInfo<'info>,
  ) -> Result<()> {
    transfer_token(
      token_program,
      buyer_token_account,
      revenue_escrow_token_account,
      buyer,
      (num_tickets as u64) * self.raffle.ticket_price,
      None,
    )?;
    Ok(())
  }

  pub fn set_winners(&mut self, winner_ids: &Vec<u16>) {
    self.raffle.winner_ids = winner_ids.clone();
    self.raffle.status = ListingStatus::Finished;
  }

  pub fn make_raffle(&mut self, ticket_positions: &Vec<u16>) {
    self.raffle.winner_ids = pick_winners(
      ticket_positions,
      self.raffle.ticket_sold,
      self.raffle.num_raffled_nfts,
      // Pass in the timestamp explicitly to help setting up mock timestamp
      // during testing.
      get_current_timestamp(self.global_states),
    );
    self.raffle.status = ListingStatus::Finished;
  }

  pub fn cancel(&mut self) {
    self.raffle.status = ListingStatus::Cancelled;
  }

  pub fn claim_reward(&mut self, ticket_position_id: u64) {
    let winner_index = self.get_winner_index(ticket_position_id).unwrap();
    self.raffle.claim_mask |= 1 << winner_index;
  }

  pub fn transfer_rewards(
    &mut self,
    token_program: &'accounts Program<'info, Token>,
    rewards_escrow_nft_account: &'accounts Account<'info, TokenAccount>,
    target_nft_account: &'accounts Account<'info, TokenAccount>,
    amount: u64,
  ) -> Result<()> {
    transfer_token(
      token_program,
      rewards_escrow_nft_account,
      target_nft_account,
      self.raffle.to_account_info(),
      amount,
      Some(self.get_raffle_signer_seed().as_ref()),
    )?;
    Ok(())
  }

  pub fn try_close_rewards_escrow_nft_account(
    &mut self,
    token_program: &Program<'info, Token>,
    rewards_escrow_nft_account: &mut Account<'info, TokenAccount>,
    raffle_creator: &AccountInfo<'info>,
  ) -> Result<()> {
    rewards_escrow_nft_account.reload()?;
    if rewards_escrow_nft_account.amount != 0 {
      return Ok(());
    }
    close_token_account_with_signer(
      token_program,
      rewards_escrow_nft_account,
      raffle_creator.clone(),
      self.raffle.to_account_info(),
      self.get_raffle_signer_seed().as_ref(),
    )?;
    Ok(())
  }

  pub fn close_revenue_escrow_token_account(
    &mut self,
    token_program: &Program<'info, Token>,
    revenue_escrow_token_account: &mut Account<'info, TokenAccount>,
    raffle_creator: &AccountInfo<'info>,
  ) -> Result<()> {
    close_token_account_with_signer(
      token_program,
      revenue_escrow_token_account,
      raffle_creator.clone(),
      self.raffle.to_account_info(),
      self.get_raffle_signer_seed().as_ref(),
    )
  }
}
