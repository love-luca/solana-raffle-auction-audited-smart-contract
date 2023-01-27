use crate::admin::GlobalStates;
use crate::auction::{Auction, AuctionBid};
use crate::common::{get_current_timestamp, AuctionStrategy, JustiesErrorCode};
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};

/// Claims the auction lot NFT.
///
/// Only callable by the top bidder once finished. The lot NFT will be
/// transferred from the lot escrow NFT account to the bidder's NFT account. The
/// lot escrow NFT account will be closed with the rents refunded to the
/// auction creator.
///
/// The auction status is guaranteed to be "Finished" once confirmed.
#[derive(Accounts)]
#[instruction(
    auction_id: u64,
)]
pub struct ClaimLotNft<'info> {
  #[account(
      seeds = [
        b"auction",
        auction.key().as_ref(),
        b"bid",
        bidder.key().as_ref(),
      ],
      bump = bid.bump,
      constraint = bid.bidder == bidder.key() @JustiesErrorCode::InvalidBidAccount,
  )]
  pub bid: Box<Account<'info, AuctionBid>>,
  #[account(
      mut,
      seeds = [b"auction", auction_id.to_le_bytes().as_ref()],
      bump = auction.bump,
  )]
  pub auction: Box<Account<'info, Auction>>,
  #[account(
      mut,
      constraint = auction.top_bidder == Some(bidder.key()) @JustiesErrorCode::IneligibleToClaimLotNft,
  )]
  pub bidder: Signer<'info>,
  #[account(
      mut,
      seeds = [b"auction", auction.key().as_ref(), b"lot_escrow"],
      bump,
      constraint = lot_escrow_nft_account.mint == auction.nft_mint_address @JustiesErrorCode::InconsistentLotEscrowNftAccount,
      constraint = lot_escrow_nft_account.amount == 1 @JustiesErrorCode::InconsistentLotEscrowNftAccount,
  )]
  pub lot_escrow_nft_account: Box<Account<'info, TokenAccount>>,
  #[account(
      init_if_needed,
      payer = bidder,
      associated_token::mint = nft_mint,
      associated_token::authority = bidder,
  )]
  pub bidder_nft_account: Box<Account<'info, TokenAccount>>,
  #[account(
      seeds = [b"global_states"],
      bump = global_states.bump,
  )]
  pub global_states: Account<'info, GlobalStates>,
  #[account(
      mut,
      constraint = auction_creator.key() == auction.creator @JustiesErrorCode::NotAuctionCreator,
  )]
  /// CHECK: the address is verified in the constraint.
  pub auction_creator: UncheckedAccount<'info>,
  #[account(
      constraint = nft_mint.key() == auction.nft_mint_address @JustiesErrorCode::InvalidNftMint,
  )]
  pub nft_mint: Account<'info, Mint>,

  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ClaimLotNft>, _auction_id: u64) -> Result<()> {
  let lot_escrow_nft_account = &mut ctx.accounts.lot_escrow_nft_account;
  let bidder_nft_account = &ctx.accounts.bidder_nft_account;
  let current_timestamp = get_current_timestamp(&ctx.accounts.global_states);
  let mut auction_strategy = AuctionStrategy::new(
    &mut ctx.accounts.auction,
    &mut ctx.accounts.global_states,
  );

  if !auction_strategy.is_ended(current_timestamp) {
    return err!(JustiesErrorCode::OngoingAuction);
  }
  auction_strategy.transfer_lot_nft(
    &ctx.accounts.token_program,
    lot_escrow_nft_account,
    bidder_nft_account,
  )?;
  auction_strategy.close_lot_escrow_nft_account(
    &ctx.accounts.token_program,
    lot_escrow_nft_account,
    &ctx.accounts.auction_creator,
  )?;
  auction_strategy.finalize_auction_if_need();
  Ok(())
}
