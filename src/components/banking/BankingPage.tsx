/**
 * SLATE POS — Banking & Treasury Management Module
 * Comprehensive Bank Accounts, Real-time Ledger, Inter-account Transfers, and Transaction Auditing
 * Designed with SLATE POS Tricolour Theme (#16587B / #84B3CE / #F5EEDD)
 */

import React, { useState, useEffect } from 'react';
import {
  Landmark,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  FileText,
  Building2,
  CreditCard,
  Eye,
  EyeOff,
  Check,
  X,
  Calendar,
  Wallet,
  Scale,
  Download,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { offlineStore } from '../../lib/offlineStore';
import {
  BankAccount,
  BankTransaction,
  BankTransactionType,
  BankAccountType,
  BankReconciliation,
} from '../../types';
import { ActiveView } from '../layout/Sidebar';

interface BankingPageProps {
  onNavigateToView?: (view: ActiveView) => void;
}

export const BankingPage: React.FC<BankingPageProps> = ({ onNavigateToView }) => {
  const activeUser = offlineStore.getActiveUser();
  const currentOrg = offlineStore.getOrganization();

  const [accounts, setAccounts] = useState<BankAccount[]>(() => offlineStore.getBankAccounts());
  const [transactions, setTransactions] = useState<BankTransaction[]>(() => offlineStore.getBankTransactions());
  const [reconciliations, setReconciliations] = useState<BankReconciliation[]>(() => offlineStore.getBankReconciliations());
  const [selectedAccountId, setSelectedAccountId] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'ACCOUNTS' | 'TRANSACTIONS' | 'RECONCILIATION' | 'STATEMENTS'>('ACCOUNTS');
  const [searchQuery, setSearchQuery] = useState('');
  const [showMaskedNumbers, setShowMaskedNumbers] = useState(true);

  // Reconciliation states
  const [reconAccountId, setReconAccountId] = useState<string>(() => offlineStore.getBankAccounts()[0]?.id || '');
  const [reconStatementDate, setReconStatementDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [reconStatementBalance, setReconStatementBalance] = useState<string>('');
  const [reconClearedIds, setReconClearedIds] = useState<string[]>([]);
  const [reconPostAdjustment, setReconPostAdjustment] = useState<boolean>(false);
  const [reconNotes, setReconNotes] = useState<string>('');

  // Modals
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [txModalType, setTxModalType] = useState<BankTransactionType>('DEPOSIT');
  const [isReversalModalOpen, setIsReversalModalOpen] = useState(false);
  const [txToReverse, setTxToReverse] = useState<BankTransaction | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [actionFeedback, setActionFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Form states for New Account
  const [accountName, setAccountName] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [branchName, setBranchName] = useState('');
  const [accountType, setAccountType] = useState<BankAccountType>('CURRENT');
  const [openingBalance, setOpeningBalance] = useState<string>('0');
  const [isPrimary, setIsPrimary] = useState(false);
  const [notes, setNotes] = useState('');

  // Form states for New Transaction
  const [txAccountId, setTxAccountId] = useState<string>('');
  const [txToAccountId, setTxToAccountId] = useState<string>('');
  const [txAmount, setTxAmount] = useState<string>('');
  const [txReference, setTxReference] = useState<string>('');
  const [txCategory, setTxCategory] = useState<string>('General');
  const [txPayee, setTxPayee] = useState<string>('');
  const [txDescription, setTxDescription] = useState<string>('');

  useEffect(() => {
    const refreshData = () => {
      const accs = offlineStore.getBankAccounts();
      setAccounts(accs);
      setTransactions(offlineStore.getBankTransactions());
      setReconciliations(offlineStore.getBankReconciliations());
      setReconAccountId((prev) => prev || accs[0]?.id || '');
    };
    refreshData();
    const unsub = offlineStore.subscribe(refreshData);
    return unsub;
  }, []);

  const totalBankBalance = accounts.reduce((sum, a) => sum + a.currentBalance, 0);
  const totalDeposits = transactions
    .filter((t) => t.type === 'DEPOSIT' && t.status === 'COMPLETED')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalWithdrawals = transactions
    .filter((t) => (t.type === 'WITHDRAWAL' || t.type === 'TRANSFER') && t.status === 'COMPLETED')
    .reduce((sum, t) => sum + t.amount, 0);

  const filteredTransactions = transactions.filter((t) => {
    const matchesAccount = selectedAccountId === 'ALL' || (t.bankAccountId || t.accountId) === selectedAccountId;
    const matchesSearch =
      (t.transactionNumber || t.referenceNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.referenceNumber && t.referenceNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (t.description && t.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (t.payeePayer && t.payeePayer.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (t.bankAccountName || t.accountName || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesAccount && matchesSearch;
  });

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    const isCash = accountType === 'CASH';
    const resolvedBankName = bankName.trim() || (isCash ? 'Cash in Hand' : '');
    const resolvedAccountNum = accountNumber.trim() || (isCash ? `CASH-${Date.now().toString().slice(-4)}` : '');
    const resolvedIfsc = ifscCode.trim() || (isCash ? 'CASH-REGISTER' : '');

    if (!accountName.trim() || !resolvedAccountNum || !resolvedBankName || !resolvedIfsc) {
      setActionFeedback({ message: 'Please fill in all mandatory bank/cash account fields', type: 'error' });
      return;
    }

    const created = offlineStore.addBankAccount({
      organizationId: currentOrg.id,
      branchId: activeUser.branchId || offlineStore.getActiveBranchId(),
      accountName: accountName.trim(),
      accountHolderName: accountHolderName.trim() || accountName.trim(),
      accountNumber: resolvedAccountNum,
      bankName: resolvedBankName,
      ifscCode: resolvedIfsc.toUpperCase(),
      branchName: branchName.trim() || (isCash ? 'Main Counter' : 'Main'),
      accountType,
      openingBalance: parseFloat(openingBalance) || 0,
      currentBalance: parseFloat(openingBalance) || 0,
      isPrimary,
      status: 'ACTIVE',
      notes,
    });

    setIsAddAccountOpen(false);
    resetAccountForm();
    setActionFeedback({
      message: `${isCash ? 'Cash' : 'Bank'} Account "${created.bankName} (${created.accountNumber.slice(-4)})" successfully registered!`,
      type: 'success',
    });
    setTimeout(() => setActionFeedback(null), 4000);
  };

  const reconTargetAccount = accounts.find((a) => a.id === reconAccountId) || accounts[0];
  const reconAccountTransactions = reconTargetAccount
    ? transactions.filter(
        (t) => (t.bankAccountId || t.accountId) === reconTargetAccount.id && t.status === 'COMPLETED'
      )
    : [];

  const handleToggleClearedTx = (txId: string) => {
    setReconClearedIds((prev) => (prev.includes(txId) ? prev.filter((id) => id !== txId) : [...prev, txId]));
  };

  const handleSaveReconciliation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reconTargetAccount) {
      setActionFeedback({ message: 'Select a bank or cash account to reconcile.', type: 'error' });
      return;
    }
    const stmtBal = parseFloat(reconStatementBalance);
    if (isNaN(stmtBal)) {
      setActionFeedback({ message: 'Enter a valid closing balance from your bank statement.', type: 'error' });
      return;
    }

    const res = offlineStore.saveBankReconciliation({
      bankAccountId: reconTargetAccount.id,
      statementDate: reconStatementDate,
      statementClosingBalance: stmtBal,
      clearedTransactionIds: reconClearedIds,
      postAdjustmentJournal: reconPostAdjustment,
      notes: reconNotes,
    });

    if (res.success && res.reconciliation) {
      setReconNotes('');
      setReconPostAdjustment(false);
      setActionFeedback({
        message: res.adjustmentJournal
          ? `Reconciliation saved & adjustment journal ${res.adjustmentJournal.journalNumber} posted to GL!`
          : `Reconciliation saved for ${reconTargetAccount.bankName} (${res.reconciliation.status}).`,
        type: 'success',
      });
      setTimeout(() => setActionFeedback(null), 5000);
    } else {
      setActionFeedback({ message: res.error || 'Failed to save reconciliation', type: 'error' });
    }
  };

  const handleExportExcelStatement = () => {
    const rows = filteredTransactions.map((tx) => ({
      'Transaction #': tx.transactionNumber || tx.id,
      Date: tx.transactionDate,
      Account: tx.bankAccountName || tx.accountName || '',
      Type: tx.type,
      Category: tx.category || '',
      Reference: tx.referenceNumber || '',
      Counterparty: tx.payeePayer || '',
      Description: tx.description || '',
      'Amount (INR)': tx.type === 'DEPOSIT' ? tx.amount : -tx.amount,
      'Balance After (INR)': tx.balanceAfter,
      Status: tx.status,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bank Statement');
    XLSX.writeFile(wb, `SLATE_Bank_Statement_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const resetAccountForm = () => {
    setAccountName('');
    setAccountHolderName('');
    setAccountNumber('');
    setBankName('');
    setIfscCode('');
    setBranchName('');
    setAccountType('CURRENT');
    setOpeningBalance('0');
    setIsPrimary(false);
    setNotes('');
  };

  const openTxModal = (type: BankTransactionType, defaultAccId?: string) => {
    setTxModalType(type);
    setTxAccountId(defaultAccId || (accounts.length > 0 ? accounts[0].id : ''));
    setTxToAccountId(accounts.length > 1 ? accounts.find((a) => a.id !== (defaultAccId || accounts[0]?.id))?.id || '' : '');
    setTxAmount('');
    setTxReference('');
    setTxCategory(type === 'DEPOSIT' ? 'Customer Collection' : type === 'WITHDRAWAL' ? 'Operational Expense' : 'Inter-Account Transfer');
    setTxPayee('');
    setTxDescription('');
    setIsTxModalOpen(true);
  };

  const handleRecordTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(txAmount);
    if (!txAccountId || isNaN(amountNum) || amountNum <= 0) {
      setActionFeedback({ message: 'Please select account and enter a valid positive amount', type: 'error' });
      return;
    }

    if (txModalType === 'TRANSFER' && (!txToAccountId || txToAccountId === txAccountId)) {
      setActionFeedback({ message: 'Please select a distinct destination bank account for transfer', type: 'error' });
      return;
    }

    const result = offlineStore.recordBankTransaction({
      bankAccountId: txAccountId,
      type: txModalType,
      amount: amountNum,
      referenceNumber: txReference,
      category: txCategory,
      payeePayer: txPayee,
      description: txDescription,
      toBankAccountId: txModalType === 'TRANSFER' ? txToAccountId : undefined,
      initiatedBy: activeUser.id,
      orgId: currentOrg.id,
    });

    if (result.success) {
      setIsTxModalOpen(false);
      setActionFeedback({
        message: `${txModalType} of ₹${amountNum.toLocaleString('en-IN')} recorded successfully!`,
        type: 'success',
      });
      setTimeout(() => setActionFeedback(null), 4000);
    } else {
      setActionFeedback({ message: result.error || 'Failed to record transaction', type: 'error' });
    }
  };

  const handleExecuteReversal = () => {
    if (!txToReverse) return;
    if (!reversalReason.trim()) {
      setActionFeedback({ message: 'Please provide a clear justification for reversal', type: 'error' });
      return;
    }

    const result = offlineStore.reverseBankTransaction(txToReverse.id, reversalReason, activeUser.name);
    if (result.success) {
      setIsReversalModalOpen(false);
      setTxToReverse(null);
      setReversalReason('');
      setActionFeedback({
        message: `Transaction ${txToReverse.transactionNumber || txToReverse.referenceNumber || txToReverse.id} reversed successfully!`,
        type: 'success',
      });
      setTimeout(() => setActionFeedback(null), 4000);
    } else {
      setActionFeedback({ message: result.error || 'Reversal failed', type: 'error' });
    }
  };

  const maskNumber = (num: string) => {
    if (!showMaskedNumbers || num.length < 5) return num;
    return '•••• •••• ' + num.slice(-4);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F5EEDD] overflow-y-auto">
      {/* Top Banner / Breadcrumb */}
      <div className="bg-[#16587B] text-white px-4 sm:px-6 py-4 shrink-0 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-[#124866] rounded-md text-[#84B3CE]">
                <Landmark className="w-5 h-5" />
              </span>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Banking & Treasury</h1>
              <span className="text-xs bg-[#84B3CE] text-[#0F2D3D] font-semibold px-2 py-0.5 rounded-full">
                {currentOrg.name}
              </span>
            </div>
            <p className="text-xs text-[#F5EEDD]/85 mt-1">
              Real-time liquid bank balances, automated reconciliation, and multi-tenant ledger verification
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => openTxModal('DEPOSIT')}
              className="px-3 py-2 bg-[#124866] hover:bg-[#0F405B] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer border border-white/20"
            >
              <ArrowDownLeft className="w-4 h-4 text-[#84B3CE]" />
              Deposit
            </button>
            <button
              onClick={() => openTxModal('WITHDRAWAL')}
              className="px-3 py-2 bg-[#124866] hover:bg-[#0F405B] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer border border-white/20"
            >
              <ArrowUpRight className="w-4 h-4 text-amber-300" />
              Withdraw
            </button>
            <button
              onClick={() => openTxModal('TRANSFER')}
              className="px-3 py-2 bg-[#124866] hover:bg-[#0F405B] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer border border-white/20"
            >
              <ArrowLeftRight className="w-4 h-4 text-blue-200" />
              Transfer
            </button>
            <button
              onClick={() => setIsAddAccountOpen(true)}
              className="px-3.5 py-2 bg-[#84B3CE] hover:bg-[#9AC2D8] text-[#0F2D3D] text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4 text-[#0F2D3D]" />
              Add Account
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto w-full p-4 sm:p-6 space-y-5">
        {/* Feedback Alert */}
        {actionFeedback && (
          <div
            className={`p-3.5 rounded-lg text-xs font-medium flex items-center justify-between border ${
              actionFeedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-red-50 text-red-800 border-red-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {actionFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span>{actionFeedback.message}</span>
            </div>
            <button onClick={() => setActionFeedback(null)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Dashboard Financial Summary Cards (Mobile & Desktop Banking Layout) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Card 1: Total Bank Balance */}
          <div className="bg-white rounded-xl p-4 border border-[#D1D7DB] shadow-2xs hover:shadow-xs transition-all relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-[#84B3CE]/20 rounded-bl-full pointer-events-none" />
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#667781]">Total Bank Balance</span>
              <div className="p-2 rounded-lg bg-[#84B3CE]/30 text-[#16587B]">
                <Building2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5">
              <div className="text-2xl font-bold text-[#111B21] tracking-tight">
                ₹{totalBankBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-[#667781] mt-1 flex items-center gap-1">
                <span className="font-semibold text-[#16587B]">{accounts.length}</span> active corporate accounts
              </div>
            </div>
          </div>

          {/* Card 2: Total Inflows / Deposits */}
          <div className="bg-white rounded-xl p-4 border border-[#D1D7DB] shadow-2xs hover:shadow-xs transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#667781]">Total Inflows (Deposits)</span>
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700">
                <ArrowDownLeft className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5">
              <div className="text-2xl font-bold text-emerald-700 tracking-tight">
                +₹{totalDeposits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-[#667781] mt-1">Verified bank credits</div>
            </div>
          </div>

          {/* Card 3: Total Outflows / Withdrawals */}
          <div className="bg-white rounded-xl p-4 border border-[#D1D7DB] shadow-2xs hover:shadow-xs transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#667781]">Total Outflows (Withdrawals)</span>
              <div className="p-2 rounded-lg bg-amber-50 text-amber-700">
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5">
              <div className="text-2xl font-bold text-amber-700 tracking-tight">
                -₹{totalWithdrawals.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-[#667781] mt-1">Vendor bills & operational expenses</div>
            </div>
          </div>

          {/* Card 4: Net Liquid Treasury */}
          <div className="bg-white rounded-xl p-4 border border-[#D1D7DB] shadow-2xs hover:shadow-xs transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#667781]">Liquid Capital Coverage</span>
              <div className="p-2 rounded-lg bg-blue-50 text-blue-700">
                <Wallet className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5">
              <div className="text-2xl font-bold text-[#111B21] tracking-tight">
                {accounts.filter((a) => a.isPrimary)[0]?.bankName || 'Primary Bank'}
              </div>
              <div className="text-[11px] text-[#667781] mt-1 flex items-center justify-between">
                <span>Default Disbursement A/C</span>
                <span className="font-semibold text-[#16587B]">Active</span>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs & Filters */}
        <div className="bg-white rounded-xl border border-[#D1D7DB] shadow-2xs overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E9EDEF] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[#FAF6EC]">
            {/* Tabs */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('ACCOUNTS')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'ACCOUNTS'
                    ? 'bg-[#16587B] text-white shadow-2xs'
                    : 'text-[#667781] hover:bg-[#F5EEDD] hover:text-[#111B21]'
                }`}
              >
                Bank &amp; Cash ({accounts.length})
              </button>
              <button
                onClick={() => setActiveTab('TRANSACTIONS')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'TRANSACTIONS'
                    ? 'bg-[#16587B] text-white shadow-2xs'
                    : 'text-[#667781] hover:bg-[#F5EEDD] hover:text-[#111B21]'
                }`}
              >
                Ledger Transactions ({transactions.length})
              </button>
              <button
                onClick={() => setActiveTab('RECONCILIATION')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                  activeTab === 'RECONCILIATION'
                    ? 'bg-[#16587B] text-white shadow-2xs'
                    : 'text-[#667781] hover:bg-[#F5EEDD] hover:text-[#111B21]'
                }`}
              >
                <Scale className="w-3.5 h-3.5" />
                Reconciliation ({reconciliations.length})
              </button>
              <button
                onClick={() => setActiveTab('STATEMENTS')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'STATEMENTS'
                    ? 'bg-[#16587B] text-white shadow-2xs'
                    : 'text-[#667781] hover:bg-[#F5EEDD] hover:text-[#111B21]'
                }`}
              >
                Audit Statements
              </button>
            </div>

            {/* Utility actions */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#667781] absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Search ledger..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs bg-white border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B] w-48 sm:w-56"
                />
              </div>
              <button
                onClick={() => setShowMaskedNumbers(!showMaskedNumbers)}
                title={showMaskedNumbers ? 'Reveal full account numbers' : 'Mask account numbers'}
                className="p-1.5 bg-white border border-[#D1D7DB] rounded-lg text-[#667781] hover:text-[#111B21] transition-colors cursor-pointer"
              >
                {showMaskedNumbers ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* TAB 1: BANK ACCOUNTS */}
          {activeTab === 'ACCOUNTS' && (
            <div className="p-4 sm:p-5">
              {accounts.length === 0 ? (
                <div className="text-center py-12 text-[#667781]">
                  <Landmark className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                  <p className="text-sm font-semibold">No bank accounts configured</p>
                  <p className="text-xs text-gray-400 mt-1">Add your enterprise current account to start recording transactions.</p>
                  <button
                    onClick={() => setIsAddAccountOpen(true)}
                    className="mt-4 px-4 py-2 bg-[#16587B] hover:bg-[#124866] text-[#F5EEDD] text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    Add First Account
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {accounts.map((acc) => (
                    <div
                      key={acc.id}
                      className="border border-[#D1D7DB] rounded-xl p-4 bg-white hover:border-[#16587B] transition-all flex flex-col justify-between shadow-2xs"
                    >
                      <div>
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-9 h-9 rounded-lg bg-[#84B3CE]/25 flex items-center justify-center text-[#16587B] font-bold text-sm">
                              {acc.bankName.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-semibold text-xs text-[#111B21] leading-tight">{acc.bankName}</div>
                              <div className="text-[11px] text-[#667781]">{acc.accountName}</div>
                            </div>
                          </div>
                          {acc.isPrimary && (
                            <span className="text-[10px] font-bold bg-[#84B3CE]/30 text-[#16587B] px-2 py-0.5 rounded-full">
                              PRIMARY
                            </span>
                          )}
                        </div>

                        <div className="mt-4 p-3 bg-[#FAF6EC] rounded-lg border border-[#E9EDEF] space-y-1.5 text-xs">
                          <div className="flex justify-between text-[#667781]">
                            <span>A/C Number:</span>
                            <span className="font-mono font-medium text-[#111B21]">{maskNumber(acc.accountNumber)}</span>
                          </div>
                          <div className="flex justify-between text-[#667781]">
                            <span>IFSC Code:</span>
                            <span className="font-mono font-medium text-[#111B21]">{acc.ifscCode}</span>
                          </div>
                          <div className="flex justify-between text-[#667781]">
                            <span>Type / Branch:</span>
                            <span className="text-[#111B21] font-medium">{acc.accountType} · {acc.branchName || 'Main'}</span>
                          </div>
                        </div>

                        <div className="mt-3.5">
                          <span className="text-[10px] uppercase font-semibold tracking-wider text-[#667781]">Available Balance</span>
                          <div className="text-xl font-bold text-[#16587B]">
                            ₹{acc.currentBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-[#E9EDEF] flex items-center justify-between gap-2">
                        <button
                          onClick={() => openTxModal('DEPOSIT', acc.id)}
                          className="flex-1 py-1.5 bg-[#FAF6EC] hover:bg-[#84B3CE]/25 text-[#16587B] text-[11px] font-semibold rounded-md transition-colors cursor-pointer text-center"
                        >
                          + Deposit
                        </button>
                        <button
                          onClick={() => openTxModal('WITHDRAWAL', acc.id)}
                          className="flex-1 py-1.5 bg-[#FAF6EC] hover:bg-amber-100 text-amber-900 text-[11px] font-semibold rounded-md transition-colors cursor-pointer text-center"
                        >
                          - Withdraw
                        </button>
                        <button
                          onClick={() => {
                            setSelectedAccountId(acc.id);
                            setActiveTab('TRANSACTIONS');
                          }}
                          className="py-1.5 px-2 text-[#667781] hover:text-[#16587B] text-[11px] font-medium rounded-md hover:bg-[#FAF6EC] transition-colors"
                        >
                          Ledger
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: TRANSACTION LEDGER */}
          {activeTab === 'TRANSACTIONS' && (
            <div className="overflow-x-auto">
              {/* Account Filter Pill Selector */}
              <div className="p-3 bg-white border-b border-[#E9EDEF] flex items-center gap-2 overflow-x-auto">
                <span className="text-xs font-medium text-[#667781] shrink-0">Filter by Account:</span>
                <button
                  onClick={() => setSelectedAccountId('ALL')}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors shrink-0 cursor-pointer ${
                    selectedAccountId === 'ALL'
                      ? 'bg-[#16587B] text-white font-semibold'
                      : 'bg-[#FAF6EC] text-[#667781] hover:bg-[#F5EEDD]'
                  }`}
                >
                  All Accounts ({transactions.length})
                </button>
                {accounts.map((acc) => (
                  <button
                    key={acc.id}
                    onClick={() => setSelectedAccountId(acc.id)}
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors shrink-0 cursor-pointer ${
                      selectedAccountId === acc.id
                        ? 'bg-[#16587B] text-white font-semibold'
                        : 'bg-[#FAF6EC] text-[#667781] hover:bg-[#F5EEDD]'
                    }`}
                  >
                    {acc.bankName} ({acc.accountNumber.slice(-4)})
                  </button>
                ))}
              </div>

              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#FAF6EC] text-[#667781] border-b border-[#E9EDEF]">
                    <th className="py-2.5 px-4 font-semibold">Tx Number</th>
                    <th className="py-2.5 px-4 font-semibold">Date</th>
                    <th className="py-2.5 px-4 font-semibold">Bank Account</th>
                    <th className="py-2.5 px-4 font-semibold">Type</th>
                    <th className="py-2.5 px-4 font-semibold">Category / Ref</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Amount</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Balance After</th>
                    <th className="py-2.5 px-4 font-semibold text-center">Status</th>
                    <th className="py-2.5 px-4 font-semibold text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9EDEF]">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-[#667781]">
                        No transactions recorded for the selected account filter.
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-[#FAF6EC] transition-colors">
                        <td className="py-2.5 px-4 font-mono font-medium text-[#111B21]">{tx.transactionNumber || tx.referenceNumber}</td>
                        <td className="py-2.5 px-4 text-[#667781] whitespace-nowrap">{tx.transactionDate}</td>
                        <td className="py-2.5 px-4 font-medium text-[#111B21]">{tx.bankAccountName || tx.accountName}</td>
                        <td className="py-2.5 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                              tx.type === 'DEPOSIT'
                                ? 'bg-emerald-100 text-emerald-800'
                                : tx.type === 'WITHDRAWAL'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {tx.type}
                          </span>
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="text-[#111B21] font-medium">{tx.category || tx.type}</div>
                          <div className="text-[11px] text-[#667781]">{tx.referenceNumber || 'N/A'}</div>
                        </td>
                        <td className="py-2.5 px-4 text-right font-semibold">
                          <span className={tx.type === 'DEPOSIT' ? 'text-emerald-700' : 'text-amber-700'}>
                            {tx.type === 'DEPOSIT' ? '+' : '-'}₹{tx.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right font-medium text-[#111B21]">
                          ₹{tx.balanceAfter.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              tx.status === 'COMPLETED'
                                ? 'bg-emerald-50 text-emerald-700'
                                : tx.status === 'REVERSED'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {tx.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          {tx.status === 'COMPLETED' && (
                            <button
                              onClick={() => {
                                setTxToReverse(tx);
                                setIsReversalModalOpen(true);
                              }}
                              title="Reverse transaction"
                              className="p-1 text-gray-400 hover:text-purple-700 hover:bg-purple-50 rounded transition-colors"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 3: BANK RECONCILIATION */}
          {activeTab === 'RECONCILIATION' && (
            <div className="p-5 space-y-5 text-xs">
              <form onSubmit={handleSaveReconciliation} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 bg-[#FAF6EC] p-4 rounded-xl border border-[#D1D7DB]">
                  <div>
                    <label className="block font-semibold text-[#111B21] mb-1">Bank / Cash Account *</label>
                    <select
                      value={reconTargetAccount?.id || ''}
                      onChange={(e) => {
                        setReconAccountId(e.target.value);
                        setReconClearedIds([]);
                      }}
                      className="w-full px-3 py-2 bg-white border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B]"
                    >
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.bankName} ({acc.accountType}) — Book: ₹{acc.currentBalance.toLocaleString('en-IN')}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-[#111B21] mb-1">Statement Date *</label>
                    <input
                      type="date"
                      required
                      value={reconStatementDate}
                      onChange={(e) => setReconStatementDate(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B]"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-[#111B21] mb-1">Statement Closing Balance (₹) *</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder={reconTargetAccount ? reconTargetAccount.currentBalance.toFixed(2) : '0.00'}
                      value={reconStatementBalance}
                      onChange={(e) => setReconStatementBalance(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B] font-mono font-bold tabular-nums"
                    />
                  </div>
                </div>

                {reconTargetAccount && (() => {
                  const stmtBalNum = parseFloat(reconStatementBalance);
                  const hasStmt = !isNaN(stmtBalNum);
                  const variance = hasStmt ? Math.round((stmtBalNum - reconTargetAccount.currentBalance) * 100) / 100 : 0;
                  const clearedMovement = reconAccountTransactions
                    .filter((t) => reconClearedIds.includes(t.id))
                    .reduce((sum, t) => sum + (t.type === 'DEPOSIT' ? t.amount : -t.amount), 0);
                  const clearedBalance = Math.round((reconTargetAccount.openingBalance + clearedMovement) * 100) / 100;

                  return (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <div className="p-3 bg-white border border-[#D1D7DB] rounded-lg">
                          <div className="text-[11px] text-[#667781]">Book Balance (GL)</div>
                          <div className="text-base font-bold text-[#111B21] tabular-nums mt-0.5">
                            ₹{reconTargetAccount.currentBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                        <div className="p-3 bg-white border border-[#D1D7DB] rounded-lg">
                          <div className="text-[11px] text-[#667781]">Cleared Balance</div>
                          <div className="text-base font-bold text-[#16587B] tabular-nums mt-0.5">
                            ₹{clearedBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                        <div className="p-3 bg-white border border-[#D1D7DB] rounded-lg">
                          <div className="text-[11px] text-[#667781]">Statement Balance</div>
                          <div className="text-base font-bold text-[#111B21] tabular-nums mt-0.5">
                            {hasStmt ? `₹${stmtBalNum.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                          </div>
                        </div>
                        <div className="p-3 bg-white border border-[#D1D7DB] rounded-lg">
                          <div className="text-[11px] text-[#667781]">Variance (Stmt − Book)</div>
                          <div className={`text-base font-bold tabular-nums mt-0.5 ${Math.abs(variance) < 0.01 ? 'text-emerald-700' : 'text-amber-700'}`}>
                            {hasStmt ? `${variance >= 0 ? '+' : ''}₹${variance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                          </div>
                        </div>
                      </div>

                      <div className="border border-[#D1D7DB] rounded-lg overflow-hidden">
                        <div className="px-4 py-2.5 bg-[#FAF6EC] border-b border-[#E9EDEF] flex items-center justify-between">
                          <span className="font-bold text-[#111B21]">
                            Mark Statement-Cleared Transactions ({reconClearedIds.length} / {reconAccountTransactions.length})
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setReconClearedIds(
                                reconClearedIds.length === reconAccountTransactions.length
                                  ? []
                                  : reconAccountTransactions.map((t) => t.id)
                              )
                            }
                            className="text-[11px] font-semibold text-[#16587B] hover:underline cursor-pointer"
                          >
                            {reconClearedIds.length === reconAccountTransactions.length ? 'Clear All' : 'Select All'}
                          </button>
                        </div>
                        <div className="max-h-60 overflow-y-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-[#FAF6EC] text-[#667781] border-b border-[#E9EDEF]">
                                <th className="py-2 px-3 w-10 text-center">Cleared</th>
                                <th className="py-2 px-3">Date</th>
                                <th className="py-2 px-3">Tx # / Ref</th>
                                <th className="py-2 px-3">Type</th>
                                <th className="py-2 px-3">Description</th>
                                <th className="py-2 px-3 text-right">Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E9EDEF]">
                              {reconAccountTransactions.length === 0 ? (
                                <tr>
                                  <td colSpan={6} className="py-6 text-center text-[#667781]">
                                    No completed transactions found for this account.
                                  </td>
                                </tr>
                              ) : (
                                reconAccountTransactions.map((tx) => {
                                  const checked = reconClearedIds.includes(tx.id);
                                  return (
                                    <tr key={tx.id} className="hover:bg-[#FAF6EC]">
                                      <td className="py-2 px-3 text-center">
                                        <input
                                          type="checkbox"
                                           checked={checked}
                                           onChange={() => handleToggleClearedTx(tx.id)}
                                           className="w-4 h-4 accent-[#16587B] cursor-pointer"
                                         />
                                       </td>
                                       <td className="py-2 px-3 text-[#667781] tabular-nums">{tx.transactionDate}</td>
                                       <td className="py-2 px-3 font-mono text-[#111B21]">{tx.transactionNumber || tx.referenceNumber}</td>
                                       <td className="py-2 px-3 font-semibold">{tx.type}</td>
                                       <td className="py-2 px-3 text-[#667781]">{tx.description || tx.category}</td>
                                       <td className="py-2 px-3 text-right font-mono font-semibold tabular-nums">
                                         {tx.type === 'DEPOSIT' ? '+' : '-'}₹{tx.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                       </td>
                                     </tr>
                                   );
                                 })
                               )}
                             </tbody>
                           </table>
                         </div>
                       </div>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-[#FAF6EC] border border-[#D1D7DB] rounded-lg">
                        <div className="space-y-2 flex-1">
                          {hasStmt && Math.abs(variance) >= 0.01 && (
                            <label className="flex items-center gap-2 cursor-pointer font-semibold text-[#111B21]">
                              <input
                                type="checkbox"
                                checked={reconPostAdjustment}
                                onChange={(e) => setReconPostAdjustment(e.target.checked)}
                                className="w-4 h-4 accent-[#16587B]"
                              />
                              <span>
                                Post Reconciliation Adjustment Journal to GL ({variance < 0 ? 'Bank Charges Dr' : 'Other Income Cr'} ₹{Math.abs(variance).toFixed(2)})
                              </span>
                            </label>
                          )}
                          <input
                            type="text"
                            placeholder="Reconciliation remarks (optional)"
                            value={reconNotes}
                            onChange={(e) => setReconNotes(e.target.value)}
                            className="w-full sm:max-w-md px-3 py-1.5 bg-white border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B]"
                          />
                        </div>
                        <button
                          type="submit"
                          className="px-5 py-2.5 bg-[#16587B] hover:bg-[#124866] text-[#F5EEDD] font-bold rounded-lg transition-colors cursor-pointer shrink-0"
                        >
                          Save Reconciliation
                        </button>
                      </div>
                    </>
                  );
                })()}
              </form>

              {/* Reconciliation History */}
              <div className="border border-[#D1D7DB] rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 bg-[#FAF6EC] border-b border-[#E9EDEF] font-bold text-[#111B21]">
                  Completed Reconciliations ({reconciliations.length})
                </div>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#FAF6EC] text-[#667781] border-b border-[#E9EDEF]">
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3">Account</th>
                      <th className="py-2 px-3 text-right">Book Bal</th>
                      <th className="py-2 px-3 text-right">Stmt Bal</th>
                      <th className="py-2 px-3 text-right">Variance</th>
                      <th className="py-2 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E9EDEF]">
                    {reconciliations.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-[#667781]">
                          No reconciliations recorded yet.
                        </td>
                      </tr>
                    ) : (
                      reconciliations.map((rec) => (
                        <tr key={rec.id} className="hover:bg-[#FAF6EC]">
                          <td className="py-2 px-3 tabular-nums text-[#667781]">{rec.statementDate}</td>
                          <td className="py-2 px-3 font-medium text-[#111B21]">{rec.bankAccountName}</td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums">₹{rec.bookBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums">₹{rec.statementClosingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold">₹{rec.variance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${rec.status === 'RECONCILED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                              {rec.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: AUDIT STATEMENTS */}
          {activeTab === 'STATEMENTS' && (
            <div className="p-5 space-y-4">
              <div className="p-4 bg-[#FAF6EC] rounded-xl border border-[#D1D7DB] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-[#111B21]">Financial Statement Summary</h3>
                  <p className="text-xs text-[#667781] mt-0.5">Authoritative balance ledger for GST and statutory audit compliance.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportExcelStatement}
                    className="px-3 py-1.5 bg-[#16587B] text-[#F5EEDD] text-xs font-semibold rounded-lg hover:bg-[#124866] transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export Excel Statement
                  </button>
                  <button
                    onClick={() => {
                      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(transactions, null, 2));
                      const downloadAnchor = document.createElement('a');
                      downloadAnchor.setAttribute('href', dataStr);
                      downloadAnchor.setAttribute('download', `bank_statement_${new Date().toISOString().slice(0, 10)}.json`);
                      document.body.appendChild(downloadAnchor);
                      downloadAnchor.click();
                      downloadAnchor.remove();
                    }}
                    className="px-3 py-1.5 bg-white border border-[#D1D7DB] text-[#111B21] text-xs font-semibold rounded-lg hover:bg-[#FAF6EC] transition-colors cursor-pointer"
                  >
                    Export JSON
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-4 bg-white border border-[#D1D7DB] rounded-lg">
                  <div className="text-xs text-[#667781]">Total Ledger Transactions</div>
                  <div className="text-xl font-bold text-[#111B21] mt-1 tabular-nums">{transactions.length} entries</div>
                </div>
                <div className="p-4 bg-white border border-[#D1D7DB] rounded-lg">
                  <div className="text-xs text-[#667781]">Total Inflow Volume</div>
                  <div className="text-xl font-bold text-emerald-700 mt-1 tabular-nums">₹{totalDeposits.toLocaleString('en-IN')}</div>
                </div>
                <div className="p-4 bg-white border border-[#D1D7DB] rounded-lg">
                  <div className="text-xs text-[#667781]">Total Outflow Volume</div>
                  <div className="text-xl font-bold text-amber-700 mt-1 tabular-nums">₹{totalWithdrawals.toLocaleString('en-IN')}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: ADD BANK ACCOUNT */}
      {isAddAccountOpen && (
        <div className="fixed inset-0 z-50 bg-[#0F405B]/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden border border-[#D1D7DB]">
            <div className="bg-[#16587B] text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[#84B3CE]" />
                <h2 className="text-base font-bold">Register Bank Account</h2>
              </div>
              <button onClick={() => setIsAddAccountOpen(false)} className="text-white/80 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#111B21] mb-1">Account Nickname *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. HDFC Main Current"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#111B21] mb-1">Account Holder Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Apex Retail India Pvt Ltd"
                    value={accountHolderName}
                    onChange={(e) => setAccountHolderName(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#111B21] mb-1">
                    {accountType === 'CASH' ? 'Cash Register / Vault Name' : 'Bank Name *'}
                  </label>
                  <input
                    type="text"
                    required={accountType !== 'CASH'}
                    placeholder={accountType === 'CASH' ? 'e.g. Main Counter Cash / Petty Cash' : 'e.g. HDFC Bank, ICICI Bank'}
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#111B21] mb-1">
                    {accountType === 'CASH' ? 'Register Code (Auto if blank)' : 'Account Number *'}
                  </label>
                  <input
                    type="text"
                    required={accountType !== 'CASH'}
                    placeholder={accountType === 'CASH' ? 'e.g. CASH-01' : 'Full account number'}
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B] font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-[#111B21] mb-1">
                    {accountType === 'CASH' ? 'Code / Reference' : 'IFSC Code *'}
                  </label>
                  <input
                    type="text"
                    required={accountType !== 'CASH'}
                    placeholder={accountType === 'CASH' ? 'CASH-REGISTER' : 'e.g. HDFC0001234'}
                    value={ifscCode}
                    onChange={(e) => setIfscCode(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B] font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#111B21] mb-1">Branch Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Indiranagar Branch"
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#111B21] mb-1">Account Type</label>
                  <select
                    value={accountType}
                    onChange={(e) => setAccountType(e.target.value as BankAccountType)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B]"
                  >
                    <option value="CURRENT">Current Account</option>
                    <option value="SAVINGS">Savings Account</option>
                    <option value="OVERDRAFT">Overdraft (OD)</option>
                    <option value="CASH">Cash Account (Counter / Petty Cash)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#111B21] mb-1">Opening Balance (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B] font-mono"
                  />
                </div>
                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isPrimary}
                      onChange={(e) => setIsPrimary(e.target.checked)}
                      className="w-4 h-4 accent-[#16587B] rounded border-[#D1D7DB]"
                    />
                    <span className="font-medium text-[#111B21]">Set as Primary Corporate Account</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block font-medium text-[#111B21] mb-1">Internal Notes</label>
                <textarea
                  rows={2}
                  placeholder="Optional notes or signing authority details"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B]"
                />
              </div>

              <div className="pt-3 border-t border-[#E9EDEF] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddAccountOpen(false)}
                  className="px-4 py-2 border border-[#D1D7DB] rounded-lg text-[#667781] hover:bg-[#FAF6EC] font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#16587B] hover:bg-[#124866] text-[#F5EEDD] rounded-lg font-bold shadow-xs transition-colors cursor-pointer"
                >
                  Save Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RECORD TRANSACTION (DEPOSIT / WITHDRAWAL / TRANSFER) */}
      {isTxModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#0F405B]/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden border border-[#D1D7DB]">
            <div className="bg-[#16587B] text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {txModalType === 'DEPOSIT' && <ArrowDownLeft className="w-5 h-5 text-[#84B3CE]" />}
                {txModalType === 'WITHDRAWAL' && <ArrowUpRight className="w-5 h-5 text-amber-300" />}
                {txModalType === 'TRANSFER' && <ArrowLeftRight className="w-5 h-5 text-blue-200" />}
                <h2 className="text-base font-bold">Record {txModalType}</h2>
              </div>
              <button onClick={() => setIsTxModalOpen(false)} className="text-white/80 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRecordTransaction} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-[#111B21] mb-1">
                  {txModalType === 'TRANSFER' ? 'From Bank Account *' : 'Bank Account *'}
                </label>
                <select
                  required
                  value={txAccountId}
                  onChange={(e) => setTxAccountId(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B]"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.bankName} ({a.accountNumber.slice(-4)}) — Balance: ₹{a.currentBalance.toLocaleString('en-IN')}
                    </option>
                  ))}
                </select>
              </div>

              {txModalType === 'TRANSFER' && (
                <div>
                  <label className="block font-medium text-[#111B21] mb-1">To Destination Account *</label>
                  <select
                    required
                    value={txToAccountId}
                    onChange={(e) => setTxToAccountId(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B]"
                  >
                    <option value="">-- Select Destination Account --</option>
                    {accounts
                      .filter((a) => a.id !== txAccountId)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.bankName} ({a.accountNumber.slice(-4)}) — Balance: ₹{a.currentBalance.toLocaleString('en-IN')}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-medium text-[#111B21] mb-1">Transaction Amount (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B] text-sm font-bold font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#111B21] mb-1">Category</label>
                  <input
                    type="text"
                    value={txCategory}
                    onChange={(e) => setTxCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#111B21] mb-1">Ref / UTR / Cheque #</label>
                  <input
                    type="text"
                    placeholder="e.g. UTR892102"
                    value={txReference}
                    onChange={(e) => setTxReference(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B] font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-[#111B21] mb-1">Payee / Payer</label>
                <input
                  type="text"
                  placeholder="Party name or counterparty"
                  value={txPayee}
                  onChange={(e) => setTxPayee(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B]"
                />
              </div>

              <div>
                <label className="block font-medium text-[#111B21] mb-1">Description / Narration</label>
                <input
                  type="text"
                  placeholder="Brief narration for ledger"
                  value={txDescription}
                  onChange={(e) => setTxDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B]"
                />
              </div>

              <div className="pt-3 border-t border-[#E9EDEF] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsTxModalOpen(false)}
                  className="px-4 py-2 border border-[#D1D7DB] rounded-lg text-[#667781] hover:bg-[#FAF6EC] font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#16587B] hover:bg-[#124866] text-[#F5EEDD] rounded-lg font-bold shadow-xs transition-colors cursor-pointer"
                >
                  Confirm & Post
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: REVERSAL JUSTIFICATION */}
      {isReversalModalOpen && txToReverse && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden border border-[#D1D7DB]">
            <div className="bg-purple-900 text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-purple-200" />
                <h2 className="text-base font-bold">Reverse Transaction</h2>
              </div>
              <button onClick={() => setIsReversalModalOpen(false)} className="text-white/80 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-purple-50 text-purple-900 rounded-lg border border-purple-200">
                <div className="font-bold">Transaction: {txToReverse.transactionNumber || txToReverse.referenceNumber}</div>
                <div className="mt-1">
                  Type: {txToReverse.type} | Amount: ₹{txToReverse.amount.toLocaleString('en-IN')} | Date: {txToReverse.transactionDate}
                </div>
                <div className="text-[11px] text-purple-700 mt-1">
                  This action creates an atomic reversing transaction entry and updates bank account balances immutably.
                </div>
              </div>

              <div>
                <label className="block font-medium text-[#111B21] mb-1">Audit Justification / Reason *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Explain why this transaction is being reversed..."
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-purple-600"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsReversalModalOpen(false)}
                  className="px-4 py-2 border border-[#D1D7DB] rounded-lg text-[#667781] hover:bg-gray-50 font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecuteReversal}
                  className="px-5 py-2 bg-purple-800 hover:bg-purple-900 text-white rounded-lg font-bold shadow-xs transition-colors"
                >
                  Execute Reversal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
