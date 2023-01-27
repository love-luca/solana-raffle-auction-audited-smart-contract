use crate::admin::GlobalStates;
use crate::auction::{Auction, AuctionBid};
use crate::common::{get_current_timestamp, BidStrategy, JustiesErrorCode};
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};

/// Cancels the auction bid.
///
/// Only callable by non-top-bidder. The bid funds will be refunded from the bid
/// escrow token account to the bidder's token account. The bid escrow token
/// account will be closed with the rents refunded to the bidder.
///
/// The auction status is guaranteed to be "Finished" once confirmed after
/// auction ended.
#[derive(Accounts)]
#[instruction(
    auction_id: u64,
)]
pub struct CancelAuctionBid<'info> {
  #[account(
      mut,
      seeds = [
        b"auction",
        auction.key().as_ref(),
        b"bid",
        bidder.key().as_ref(),
      ],
      bump = bid.bump,
      constraint = bid.bidder == bidder.key() @JustiesErrorCode::NotTheBidder,
  )]
  pub bid: Box<Account<'info, AuctionBid>>,
  #[account(
      mut,
      seeds = [b"auction", auction_id.to_le_bytes().as_ref()],
      bump = auction.bump,
      constraint = auction.top_bidder != Some(bidder.key()) @JustiesErrorCode::TopBidderCannotCancelBid,
  )]
  pub auction: Box<Account<'info, Auction>>,
  #[account(mut)]
  pub bidder: Signer<'info>,
  #[account(
      mut,
      seeds = [
        b"auction",
        auction.key().as_ref(),
        b"bid",
        bidder.key().as_ref(),
        b"escrow",
      ],
      bump,
      constraint = bid_escrow_token_account.mint == auction.currency_token_mint_address @JustiesErrorCode::InconsistentBidEscrowTokenAccount,
      constraint = bid_escrow_token_account.amount == bid.bid @JustiesErrorCode::InconsistentBidEscrowTokenAccount,
  )]
  pub bid_escrow_token_account: Box<Account<'info, TokenAccount>>,
  #[account(
      init_if_needed,
      payer = bidder,
      associated_token::mint = token_mint,
      associated_token::authority = bidder,
  )]
  pub bidder_token_account: Box<Account<'info, TokenAccount>>,
  #[account(
      constraint = token_mint.key() == auction.currency_token_mint_address @JustiesErrorCode::InvalidCurrencyTokenMint,
  )]
  pub token_mint: Box<Account<'info, Mint>>,
  #[account(
      seeds = [b"global_states"],
      bump = global_states.bump,
  )]
  pub global_states: Box<Account<'info, GlobalStates>>,

  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CancelAuctionBid>) -> Result<()> {
  let token_program = &ctx.accounts.token_program;
  let bid_escrow_token_account = &mut ctx.accounts.bid_escrow_token_account;
  let bidder_token_account = &ctx.accounts.bidder_token_account;
  let current_timestamp = get_current_timestamp(&ctx.accounts.global_states);
  let mut bid_strategy = BidStrategy::new(
    &mut ctx.accounts.bid,
    &mut ctx.accounts.auction,
    None,
    &ctx.accounts.bidder,
    &mut ctx.accounts.global_states,
    0,
    0,
    current_timestamp,
  );
  bid_strategy.refund(
    token_program,
    bid_escrow_token_account,
    bidder_token_account,
  )?;
  bid_strategy
    .close_bid_escrow_token_account(token_program, bid_escrow_token_account)?;
  bid_strategy.cancel_bid();
  Ok(())
}
