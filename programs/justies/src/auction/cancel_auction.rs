use crate::admin::GlobalStates;
use crate::auction::Auction;
use crate::common::AuctionStrategy;
use crate::common::JustiesErrorCode;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Token, TokenAccount};

/// Cancels auction if there are no bids made.
///
/// Only the creator can cancel an auction. Once cancelled, the lot NFT will be
/// transferred back from the escrow to the creator's NFT account, and the
/// escrow NFT account will be closed & the creator gets the rent refunded.
///
/// Please note that the only pre-requisite required cancellation is that there
/// are no bids, no matter of the auction status.
///
/// The auction status will be marked as "Cancelled".
#[derive(Accounts)]
#[instruction(
    auction_id: u64,
)]
pub struct CancelAuction<'info> {
  #[account(
      mut,
      seeds = [b"auction", auction_id.to_le_bytes().as_ref()],
      bump = auction.bump,
      constraint = auction.creator == creator.key() @JustiesErrorCode::NotAuctionCreator,
      constraint = auction.total_bids == 0 @JustiesErrorCode::AuctionNotCancelable,
      constraint = auction.nft_mint_address == nft_mint.key() @JustiesErrorCode::NftMintAddressMismatch,
  )]
  pub auction: Box<Account<'info, Auction>>,
  #[account(mut)]
  pub creator: Signer<'info>,
  /// CHECK: verified in the constraint.
  pub nft_mint: UncheckedAccount<'info>,
  #[account(
      mut,
      seeds = [b"auction", auction.key().as_ref(), b"lot_escrow"],
      bump,
      token::mint = nft_mint,
      token::authority = auction,
  )]
  pub lot_escrow_nft_account: Box<Account<'info, TokenAccount>>,
  #[account(
      init_if_needed,
      payer = creator,
      associated_token::mint = nft_mint,
      associated_token::authority = creator,
  )]
  pub creator_nft_account: Box<Account<'info, TokenAccount>>,
  #[account(
      seeds = [b"global_states"],
      bump = global_states.bump,
  )]
  pub global_states: Box<Account<'info, GlobalStates>>,

  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CancelAuction>) -> Result<()> {
  let mut auction_strategy = AuctionStrategy::new(
    &mut ctx.accounts.auction,
    &mut ctx.accounts.global_states,
  );
  auction_strategy.transfer_lot_nft(
    &ctx.accounts.token_program,
    &ctx.accounts.lot_escrow_nft_account,
    &ctx.accounts.creator_nft_account,
  )?;
  auction_strategy.close_lot_escrow_nft_account(
    &ctx.accounts.token_program,
    &mut ctx.accounts.lot_escrow_nft_account,
    &ctx.accounts.creator.to_account_info(),
  )?;
  auction_strategy.cancel();
  Ok(())
}
