use crate::common::JustiesErrorCode;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use anchor_lang::solana_program::system_instruction::transfer;
use anchor_lang::system_program::{create_account, CreateAccount};
use anchor_lang::ToAccountInfo;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{CloseAccount, Transfer};
use anchor_spl::token::{Token, TokenAccount};
use std::cmp::Ordering;

pub fn transfer_token<'accounts, 'info>(
  token_program: &'accounts Program<'info, Token>,
  from: &'accounts Account<'info, TokenAccount>,
  to: &'accounts Account<'info, TokenAccount>,
  authority: AccountInfo<'info>,
  amount: u64,
  signer_seed: Option<&[&[u8]]>,
) -> Result<()> {
  if amount == 0 {
    return Ok(());
  }

  let seeds = if signer_seed == None {
    vec![]
  } else {
    vec![signer_seed.unwrap()]
  };

  let transfer_instruction = Transfer {
    from: from.to_account_info(),
    to: to.to_account_info(),
    authority,
  };

  let cpi_ctx = if signer_seed == None {
    CpiContext::new(token_program.to_account_info(), transfer_instruction)
  } else {
    CpiContext::new_with_signer(
      token_program.to_account_info(),
      transfer_instruction,
      seeds.as_slice(),
    )
  };

  anchor_spl::token::transfer(cpi_ctx, amount)?;

  Ok(())
}

pub fn close_token_account_with_signer<'accounts, 'info>(
  token_program: &'accounts Program<'info, Token>,
  account: &'accounts mut Account<'info, TokenAccount>,
  destination: AccountInfo<'info>,
  authority: AccountInfo<'info>,
  signer_seed: &[&[u8]],
) -> Result<()> {
  account.reload()?;
  if account.amount != 0 {
    return err!(JustiesErrorCode::CloseNonZeroBalanceAccount);
  }
  let seeds = vec![signer_seed];
  let instruction = CloseAccount {
    account: account.to_account_info(),
    destination,
    authority,
  };
  let cpi_ctx = CpiContext::new_with_signer(
    token_program.to_account_info(),
    instruction,
    seeds.as_slice(),
  );
  anchor_spl::token::close_account(cpi_ctx)?;
  Ok(())
}

pub fn create_associated_token_account<'info>(
  associated_token: AccountInfo<'info>,
  payer: AccountInfo<'info>,
  authority: AccountInfo<'info>,
  mint: AccountInfo<'info>,
  associated_token_program: &Program<'info, AssociatedToken>,
  token_program: &Program<'info, Token>,
  system_program: &Program<'info, System>,
) -> Result<()> {
  let cpi_program = associated_token_program.to_account_info();
  let cpi_accounts = anchor_spl::associated_token::Create {
    associated_token,
    payer,
    authority,
    mint,
    token_program: token_program.to_account_info(),
    system_program: system_program.to_account_info(),
  };
  let cpi_ctx =
    anchor_lang::context::CpiContext::new(cpi_program, cpi_accounts);
  anchor_spl::associated_token::create_idempotent(cpi_ctx)?;
  Ok(())
}

pub fn is_account_initialized(account_info: &AccountInfo) -> bool {
  account_info.lamports() > 0
}

pub fn create_pda<'info>(
  payer: AccountInfo<'info>,
  pda: AccountInfo<'info>,
  space: usize,
  signer_seed: &[&[u8]],
  owner_program: AccountInfo<'info>,
  system_program: AccountInfo<'info>,
) -> Result<()> {
  let rent = Rent::get()?;
  let minimum_balance = rent.minimum_balance(space);
  let cpi_accounts = CreateAccount {
    from: payer.to_account_info(),
    to: pda,
  };
  let seeds = vec![signer_seed.as_ref()];
  let cpi_context = CpiContext::new_with_signer(
    system_program.clone(),
    cpi_accounts,
    seeds.as_slice(),
  );
  create_account(
    cpi_context,
    minimum_balance,
    space as u64,
    owner_program.key,
  )?;
  Ok(())
}

pub fn resize_account<'info>(
  account_info: AccountInfo<'info>,
  new_space: usize,
  payer: AccountInfo<'info>,
  system_program: AccountInfo<'info>,
) -> Result<()> {
  let rent = Rent::get()?;
  let new_minimum_balance = rent.minimum_balance(new_space);
  let current_balance = account_info.lamports();

  match new_minimum_balance.cmp(&current_balance) {
    Ordering::Greater => {
      let lamports_diff = new_minimum_balance.saturating_sub(current_balance);
      invoke(
        &transfer(&payer.key(), &account_info.key(), lamports_diff),
        &[payer.clone(), account_info.clone(), system_program.clone()],
      )?;
    }
    Ordering::Less => {
      let lamports_diff = current_balance.saturating_sub(new_minimum_balance);
      **account_info.try_borrow_mut_lamports()? = new_minimum_balance;
      **payer.try_borrow_mut_lamports()? = payer
        .lamports()
        .checked_add(lamports_diff)
        .expect("Add error");
    }
    Ordering::Equal => {}
  }
  account_info.realloc(new_space, false)?;
  Ok(())
}
