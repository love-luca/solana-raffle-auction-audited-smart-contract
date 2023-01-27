use crate::admin::GlobalStates;
use crate::auction::{Auction, AuctionBid};
use crate::common::{
  get_current_timestamp, BidStrategy, JustiesErrorCode, EligibilityCheckInput,
  EligibilityCheckStrategy, PubkeyIndexPage,
};
use crate::program::Justies;
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

/// Makes bid to an auction.
///
/// The user need to specify a bid amount and maximum allowed bid amount to
/// allow some slippages. The actual bid amount is calculated as
/// "max(bid_amount, minimum_eligible_outbid_amount)", which should not exceed
/// the max_allowed_bid_amount. User only need to transfer the delta amount
/// between the actual bid amount and their previous bid (if any) from its token
/// wallet to the bid escrow token wallet (with bid as token authority).
///
/// The bid can be looked up by auction address and bidder address, or can be
/// iterated from the bid_index accounts.
///
/// When the auction is exclusive to a holder group, the user also need to set
/// eligibility_check_input and corresponding account payloads as
/// "remaining_accounts". For more details, check the docstring of
/// EligibilityCheckInput.
///
/// Once confirmed, the top bidding states will be updated in auction account.
#[derive(Accounts)]
#[instruction(
    auction_id: u64,
    bid_amount: u64,
    max_allowed_bid_amount: u64,
    eligibility_check_input: Option<EligibilityCheckInput>,
)]
pub struct MakeBid<'info> {
  #[account(
      init_if_needed,
      payer = bidder,
      space = 8 + AuctionBid::MAX_DATA_SIZE,
      seeds = [
        b"auction",
        auction.key().as_ref(),
        b"bid",
        bidder.key().as_ref(),
      ],
      bump,
  )]
  pub bid: Box<Account<'info, AuctionBid>>,
  /// CHECK: checked by the constraints.
  #[account(
      mut,
      seeds = [
        b"auction",
        auction.key().as_ref(),
        b"bid_index",
        PubkeyIndexPage::page_id(
          auction.total_bids,
          global_states.num_keys_per_index_page,
        ).to_le_bytes().as_ref(),
      ],
      bump,
  )]
  pub bid_index: UncheckedAccount<'info>,
  #[account(
      mut,
      seeds = [b"auction", auction_id.to_le_bytes().as_ref()],
      bump = auction.bump,
  )]
  pub auction: Box<Account<'info, Auction>>,
  #[account(
      mut,
      constraint = bidder.key() != auction.creator @JustiesErrorCode::AuctionCreatorCannotMakeBid,
  )]
  pub bidder: Signer<'info>,
  #[account(
      init_if_needed,
      payer = bidder,
      seeds = [
        b"auction",
        auction.key().as_ref(),
        b"bid",
        bidder.key().as_ref(),
        b"escrow",
      ],
      bump,
      token::mint = currency_token_mint,
      token::authority = bid,
  )]
  pub bid_escrow_token_account: Box<Account<'info, TokenAccount>>,
  #[account(
      mut,
      constraint = bidder_token_account.owner == bidder.key() @JustiesErrorCode::InvalidBidderTokenAccount,
      constraint = bidder_token_account.mint == currency_token_mint.key() @JustiesErrorCode::InvalidBidderTokenAccount,
  )]
  pub bidder_token_account: Box<Account<'info, TokenAccount>>,
  #[account(
      constraint = currency_token_mint.key() == auction.currency_token_mint_address @JustiesErrorCode::InvalidCurrencyTokenMint,
  )]
  pub currency_token_mint: Box<Account<'info, Mint>>,
  #[account(
      seeds = [b"global_states"],
      bump = global_states.bump,
  )]
  pub global_states: Box<Account<'info, GlobalStates>>,

  pub justies_program: Program<'info, Justies>,
  pub token_program: Program<'info, Token>,
  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<MakeBid>,
  _auction_id: u64,
  bid_amount: u64,
  max_allowed_bid_amount: u64,
  eligibility_check_input: Option<EligibilityCheckInput>,
) -> Result<()> {
  // Check the bidder's eligibility first.
  let eligibility_check_strategy = EligibilityCheckStrategy::new(
    &ctx.accounts.auction.eligible_groups,
    ctx.accounts.bidder.key(),
    eligibility_check_input,
    &ctx.remaining_accounts,
  )?;
  eligibility_check_strategy.check_eligibility()?;

  // These accounts needs to be cloned as ctx.accounts has been mut-borrowed
  // by the BidStrategy class.
  let bid_escrow_token_account = ctx.accounts.bid_escrow_token_account.clone();
  let bidder_token_account = ctx.accounts.bidder_token_account.clone();
  let token_program = ctx.accounts.token_program.clone();
  let current_timestamp = get_current_timestamp(&ctx.accounts.global_states);
  let mut bid_strategy = BidStrategy::new(
    &mut ctx.accounts.bid,
    &mut ctx.accounts.auction,
    Some(ctx.accounts.bid_index.to_account_info()),
    &ctx.accounts.bidder,
    &mut ctx.accounts.global_states,
    bid_amount,
    max_allowed_bid_amount,
    current_timestamp,
  );
  bid_strategy
    .validate_bid(&bid_escrow_token_account, &bidder_token_account)?;
  bid_strategy.set_bid_account_data(*ctx.bumps.get("bid").unwrap());
  bid_strategy.try_index_bid(
    *ctx.bumps.get("bid_index").unwrap(),
    &ctx.accounts.justies_program,
    &ctx.accounts.system_program,
  )?;
  bid_strategy.transfer_bid_funds(
    &token_program,
    &bidder_token_account,
    &bid_escrow_token_account,
  )?;
  bid_strategy.make_bid();
  Ok(())
}
