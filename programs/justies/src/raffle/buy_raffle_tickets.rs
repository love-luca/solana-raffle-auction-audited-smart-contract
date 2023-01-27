use crate::admin::GlobalStates;
use crate::common::{
  get_current_timestamp, JustiesErrorCode, EligibilityCheckInput,
  EligibilityCheckStrategy, PubkeyIndexPage, RaffleStrategy,
};
use crate::program::Justies;
use crate::raffle::{Raffle, RaffleTicketPosition, TicketPositionStats};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

/// Buys tickets for raffle entries (1 ticket = 1 entry).
///
/// The user needs pay num_tickets * ticket_price in the raffle's currency
/// token. The payment goes into the raffle revenue escrow token account.
///
/// The user's ticket position can be looked up by raffle address and
/// participant address. It can also be iterated via the ticket_position_index
/// accounts.
///
/// When the auction is exclusive to a holder group, the user also need to set
/// eligibility_check_input and corresponding account payloads as
/// "remaining_accounts". For more details, check the docstring of
/// EligibilityCheckInput.
#[derive(Accounts)]
#[instruction(
    raffle_id: u64,
    num_tickets: u16,
    eligibility_check_input: Option<EligibilityCheckInput>,
)]
pub struct BuyRaffleTickets<'info> {
  #[account(
      mut,
      seeds = [b"raffle", raffle_id.to_le_bytes().as_ref()],
      bump = raffle.bump,
      constraint = num_tickets > 0 @JustiesErrorCode::InvalidRaffleTicketNumber,
      constraint = num_tickets + raffle.ticket_sold <= raffle.ticket_supply @JustiesErrorCode::InvalidRaffleTicketNumber,
  )]
  pub raffle: Box<Account<'info, Raffle>>,
  #[account(
      seeds = [b"global_states"],
      bump = global_states.bump,
  )]
  pub global_states: Box<Account<'info, GlobalStates>>,
  #[account(
      mut,
      constraint = buyer.key() != raffle.creator @JustiesErrorCode::RaffleCreatorCannotBuyTickets,
  )]
  pub buyer: Signer<'info>,
  #[account(
      constraint = currency_token_mint.key() == raffle.currency_token_mint_address @JustiesErrorCode::InvalidCurrencyTokenMint,
  )]
  pub currency_token_mint: Box<Account<'info, Mint>>,
  #[account(
      mut,
      seeds = [b"raffle", raffle.key().as_ref(), b"revenue_escrow"],
      bump,
  )]
  pub revenue_escrow_token_account: Box<Account<'info, TokenAccount>>,
  #[account(
      mut,
      constraint = buyer_token_account.owner == buyer.key() @JustiesErrorCode::InvalidTicketBuyerTokenAccount,
      constraint = buyer_token_account.mint == currency_token_mint.key() @JustiesErrorCode::InvalidTicketBuyerTokenAccount,
      constraint = buyer_token_account.amount >= (num_tickets as u64) * raffle.ticket_price @JustiesErrorCode::InvalidTicketBuyerTokenAccount,
  )]
  pub buyer_token_account: Box<Account<'info, TokenAccount>>,
  #[account(
      init_if_needed,
      payer = buyer,
      space = 8 + RaffleTicketPosition::MAX_DATA_SIZE,
      seeds = [
        b"raffle",
        raffle.key().as_ref(),
        b"ticket_position",
        buyer.key().as_ref(),
      ],
      bump,
  )]
  pub ticket_position: Box<Account<'info, RaffleTicketPosition>>,
  #[account(
      mut,
      seeds = [
        b"raffle",
        raffle.key().as_ref(),
        b"ticket_position_stats",
      ],
      bump = ticket_position_stats.bump,
  )]
  pub ticket_position_stats: Box<Account<'info, TicketPositionStats>>,
  /// CHECK: checked by the constraints.
  #[account(
      mut,
      seeds = [
        b"raffle",
        raffle.key().as_ref(),
        b"ticket_position_index",
        PubkeyIndexPage::page_id(
          raffle.num_ticket_positions.into(),
          global_states.num_keys_per_index_page,
        ).to_le_bytes().as_ref(),
      ],
      bump,
  )]
  pub ticket_position_index: UncheckedAccount<'info>,

  pub token_program: Program<'info, Token>,
  pub justies_program: Program<'info, Justies>,
  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<BuyRaffleTickets>,
  num_tickets: u16,
  eligibility_check_input: Option<EligibilityCheckInput>,
) -> Result<()> {
  // Checks the buyer's eligibility first.
  let eligibility_check_strategy = EligibilityCheckStrategy::new(
    &ctx.accounts.raffle.eligible_groups,
    ctx.accounts.buyer.key(),
    eligibility_check_input,
    &ctx.remaining_accounts,
  )?;
  eligibility_check_strategy.check_eligibility()?;

  let current_timestamp = get_current_timestamp(&ctx.accounts.global_states);
  let mut raffle_strategy = RaffleStrategy::new(
    &mut ctx.accounts.raffle,
    &mut ctx.accounts.global_states,
    Some(ctx.accounts.ticket_position_index.to_account_info()),
  );
  if raffle_strategy.is_ended(current_timestamp) {
    return err!(JustiesErrorCode::RaffleEnded);
  }
  if raffle_strategy.is_cancelled() {
    return err!(JustiesErrorCode::RaffleCancelled);
  }
  let ticket_position = ctx.accounts.ticket_position.clone();
  raffle_strategy.try_index_ticket_position(
    &ticket_position,
    ctx.accounts.buyer.to_account_info(),
    *ctx.bumps.get("ticket_position_index").unwrap(),
    &ctx.accounts.justies_program,
    &ctx.accounts.system_program,
  )?;
  raffle_strategy.pay_for_tickets(
    &ctx.accounts.token_program,
    num_tickets,
    &ctx.accounts.buyer_token_account,
    &ctx.accounts.revenue_escrow_token_account,
    ctx.accounts.buyer.to_account_info(),
  )?;
  raffle_strategy.buy_tickets(
    &mut ctx.accounts.ticket_position,
    ctx.bumps["ticket_position"],
    &mut ctx.accounts.ticket_position_stats,
    num_tickets,
    ctx.accounts.buyer.to_account_info(),
    current_timestamp,
    &ctx.accounts.system_program,
  )?;
  Ok(())
}
