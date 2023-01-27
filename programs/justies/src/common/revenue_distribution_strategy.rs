use crate::admin::GlobalStates;
use crate::common::cpi_utils::{
  close_token_account_with_signer, create_associated_token_account,
  transfer_token,
};
use crate::common::{
  JustiesErrorCode, RevenueDistribution, RevenueShareConfig, ShareConfig,
};
use anchor_lang::prelude::*;
use anchor_lang::{Key, ToAccountInfo};
use anchor_spl::associated_token::{
  get_associated_token_address, AssociatedToken,
};
use anchor_spl::token::{Token, TokenAccount};
use itertools::izip;

pub fn validate_share_configs<T>(share_configs: &Vec<T>) -> Result<()>
where
  T: ShareConfig,
{
  let share_sum: u16 = share_configs
    .iter()
    .map(|distribution| distribution.share_bps())
    .sum();
  if share_sum != 10000_u16 {
    return err!(JustiesErrorCode::InvalidRevenueShareConfig);
  }
  Ok(())
}

pub fn init_revenue_distribution_accounts<'info>(
  payer: AccountInfo<'info>,
  token_mint: AccountInfo<'info>,
  revenue_share_configs: &Vec<RevenueShareConfig>,
  revenue_distribution_accounts: &Vec<AccountInfo<'info>>,
  associated_token_program: &Program<'info, AssociatedToken>,
  token_program: &Program<'info, Token>,
  system_program: &Program<'info, System>,
) -> Result<Vec<RevenueDistribution<'info>>> {
  validate_revenue_distribution_accounts(
    token_mint.clone(),
    revenue_share_configs,
    revenue_distribution_accounts,
  )?;

  let revenue_recipient_wallets =
    &revenue_distribution_accounts[0..revenue_share_configs.len()].to_vec();
  let revenue_recipient_token_accounts =
    &revenue_distribution_accounts[revenue_share_configs.len()..].to_vec();

  for (recipient_wallet, recipient_token_account) in
    izip!(revenue_recipient_wallets, revenue_recipient_token_accounts)
  {
    create_associated_token_account(
      recipient_token_account.to_account_info(),
      payer.clone(),
      recipient_wallet.clone(),
      token_mint.clone(),
      associated_token_program,
      token_program,
      system_program,
    )?;
  }

  revenue_share_configs
    .iter()
    .zip(revenue_recipient_token_accounts)
    .map(|(config, account)| -> Result<RevenueDistribution> {
      let receiver_token_account: Account<'info, TokenAccount> =
        Account::try_from(account)?;
      Ok(RevenueDistribution {
        revenue_receiver_token_account: receiver_token_account,
        share_bps: config.share_bps,
      })
    })
    .collect()
}

fn validate_revenue_distribution_accounts<'info>(
  token_mint: AccountInfo<'info>,
  revenue_share_configs: &Vec<RevenueShareConfig>,
  revenue_distribution_accounts: &Vec<AccountInfo<'info>>,
) -> Result<()> {
  // There are 2 batches of accounts within the remaining_accounts that
  // corresponds to the revenue share configs:
  // - the wallet address account info;
  // - the associated token account info;
  if revenue_share_configs.len() * 2 != revenue_distribution_accounts.len() {
    return err!(JustiesErrorCode::RevenueDistributionAccountsDoesntMatch);
  }
  let revenue_recipient_wallets =
    &revenue_distribution_accounts[0..revenue_share_configs.len()].to_vec();
  let revenue_recipient_token_accounts =
    &revenue_distribution_accounts[revenue_share_configs.len()..].to_vec();

  let all_match = revenue_share_configs
    .iter()
    .zip(revenue_recipient_wallets.iter())
    .zip(revenue_recipient_token_accounts.iter())
    .all(|((config, recipient_wallet), recipient_token_account)| {
      // Verifies that the recipient wallet is same as the one specified in the
      // revenue share config.
      if !config.revenue_receiver.eq(&recipient_wallet.key()) {
        return false;
      }
      let associated_token_account = get_associated_token_address(
        &recipient_wallet.key(),
        &token_mint.key(),
      );
      // Verifies that the associated recipient token account is same as the one
      // specified by the client.
      associated_token_account.eq(&recipient_token_account.key())
    });

  if !all_match {
    return err!(JustiesErrorCode::RevenueDistributionAccountsDoesntMatch);
  }

  Ok(())
}

pub struct RevenueDistributionStrategy<'accounts, 'info, EscrowSignerSeedFn>
where
  EscrowSignerSeedFn: Fn() -> Vec<&'accounts [u8]>,
{
  pub revenue_escrow_token_account: &'accounts mut Account<'info, TokenAccount>,
  pub fee_treasury_token_account: &'accounts Account<'info, TokenAccount>,
  pub global_states: &'accounts Account<'info, GlobalStates>,
  /// CHECK: this is safe as no data are read from it and the sanity are
  /// checked via account constraints.
  pub escrow_authority: AccountInfo<'info>,
  /// CHECK: this is safe as no data are read from it and the sanity are
  /// checked via account constraints.
  pub escrow_token_account_creator: AccountInfo<'info>,
  pub escrow_signer_seed_fn: EscrowSignerSeedFn,
  pub revenue_distributions: Vec<RevenueDistribution<'info>>,
}

impl<'accounts, 'info, EscrowSignerSeedFn>
  RevenueDistributionStrategy<'accounts, 'info, EscrowSignerSeedFn>
where
  EscrowSignerSeedFn: Fn() -> Vec<&'accounts [u8]>,
{
  pub fn validate(&self) -> Result<()> {
    validate_share_configs(&self.revenue_distributions)
  }

  pub fn distribute_revenue(
    &mut self,
    token_program: &'accounts Program<'info, Token>,
  ) -> Result<()> {
    let revenue_distributions = self.revenue_distributions.to_vec();
    let mut remaining_revenue = self.revenue_escrow_token_account.amount;
    let mut remaining_share = 10000_u16;
    remaining_revenue = self.collect_fees(token_program, remaining_revenue)?;
    let total_amount = remaining_revenue;

    for revenue_distribution in revenue_distributions.iter() {
      (remaining_revenue, remaining_share) = self.make_distribution(
        token_program,
        total_amount,
        revenue_distribution,
        remaining_revenue,
        remaining_share,
      )?;
    }

    Ok(())
  }

  fn collect_fees(
    &mut self,
    token_program: &'accounts Program<'info, Token>,
    total_revenue: u64,
  ) -> Result<u64> {
    let fee_amount =
      total_revenue * (self.global_states.market_fee_rate_bps as u64) / 10000;
    let signer_seed = (self.escrow_signer_seed_fn)();

    transfer_token(
      token_program,
      self.revenue_escrow_token_account,
      self.fee_treasury_token_account,
      self.escrow_authority.clone(),
      fee_amount,
      Some(&signer_seed),
    )?;

    Ok(total_revenue - fee_amount)
  }

  fn make_distribution(
    &mut self,
    token_program: &'accounts Program<'info, Token>,
    total_amount: u64,
    distribution: &RevenueDistribution<'info>,
    remaining_amount: u64,
    remaining_share: u16,
  ) -> Result<(u64, u16)> {
    let distribute_amount = if remaining_share == distribution.share_bps {
      remaining_amount
    } else {
      total_amount * (distribution.share_bps as u64) / 10000
    };
    let signer_seed = (self.escrow_signer_seed_fn)();

    transfer_token(
      token_program,
      self.revenue_escrow_token_account,
      &distribution.revenue_receiver_token_account,
      self.escrow_authority.clone(),
      distribute_amount,
      Some(&signer_seed),
    )?;

    Ok((
      remaining_amount - distribute_amount,
      remaining_share - distribution.share_bps,
    ))
  }

  pub fn close_revenue_escrow_token_account(
    &mut self,
    token_program: &'accounts Program<'info, Token>,
  ) -> Result<()> {
    let signer_seed = (self.escrow_signer_seed_fn)();
    close_token_account_with_signer(
      token_program,
      self.revenue_escrow_token_account,
      self.escrow_token_account_creator.clone(),
      self.escrow_authority.clone(),
      &signer_seed,
    )?;
    Ok(())
  }
}
