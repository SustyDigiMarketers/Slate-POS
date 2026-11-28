/**
 * SLATE POS — Shared Lucide Icon Mapping for Sidebar Navigation Views
 */

import React from 'react';
import type { ActiveView } from './Sidebar';
import {
  LayoutDashboard,
  Landmark,
  FileSpreadsheet,
  ShoppingCart,
  Users,
  Receipt,
  Wallet,
  FileMinus2,
  Clock,
  Building2,
  ClipboardList,
  ShoppingBag,
  Package,
  BookOpen,
  UploadCloud,
  FolderTree,
  TrendingUp,
  Scale,
  Activity,
  BarChart3,
  Settings,
  RotateCcw,
  Truck,
  PieChart,
  ListChecks,
  FileCheck2,
  Shield,
  Calendar,
  CreditCard,
  RefreshCw,
} from 'lucide-react';

export function getViewIcon(view: ActiveView, className: string = 'w-4 h-4 shrink-0'): React.ReactNode {
  switch (view) {
    case 'DASHBOARD':
      return <LayoutDashboard className={className} />;
    case 'BANKING':
      return <Landmark className={className} />;
    case 'QUOTES':
      return <FileSpreadsheet className={className} />;
    case 'POS':
      return <ShoppingCart className={className} />;
    case 'CUSTOMERS':
      return <Users className={className} />;
    case 'SALES':
      return <Receipt className={className} />;
    case 'PAYMENTS':
      return <Wallet className={className} />;
    case 'CREDIT_NOTES':
      return <FileMinus2 className={className} />;
    case 'REPORT_AR':
      return <Clock className={className} />;
    case 'SUPPLIERS':
      return <Building2 className={className} />;
    case 'PURCHASE_ORDERS':
      return <ClipboardList className={className} />;
    case 'PURCHASES':
      return <ShoppingBag className={className} />;
    case 'PURCHASE_PAYMENTS':
      return <CreditCard className={className} />;
    case 'DEBIT_NOTES':
      return <FileMinus2 className={className} />;
    case 'EXPENSES':
      return <Wallet className={className} />;
    case 'PRODUCTS':
    case 'INVENTORY':
      return <Package className={className} />;
    case 'REPORT_AP':
      return <FileCheck2 className={className} />;
    case 'JOURNAL':
      return <BookOpen className={className} />;
    case 'BULK_UPDATES':
      return <UploadCloud className={className} />;
    case 'CHART_OF_ACCOUNTS':
      return <FolderTree className={className} />;
    case 'REPORT_PL':
      return <TrendingUp className={className} />;
    case 'REPORT_BS':
      return <Scale className={className} />;
    case 'REPORT_CF':
      return <Activity className={className} />;
    case 'REPORT_GL':
      return <BookOpen className={className} />;
    case 'REPORTS':
      return <BarChart3 className={className} />;
    case 'SETTINGS':
      return <Settings className={className} />;
    case 'SALES_RETURNS':
      return <RotateCcw className={className} />;
    case 'CHALLANS':
      return <Truck className={className} />;
    case 'BUDGETS':
      return <PieChart className={className} />;
    case 'TRANSACTIONS':
      return <ListChecks className={className} />;
    case 'REPORT_TB':
      return <FileCheck2 className={className} />;
    case 'REPORT_GST':
      return <Receipt className={className} />;
    case 'REPORT_AUDIT':
      return <Shield className={className} />;
    case 'SETTINGS_BRANCHES':
      return <Building2 className={className} />;
    case 'SETTINGS_FISCAL':
      return <Calendar className={className} />;
    case 'STAFF':
      return <Shield className={className} />;
    case 'SUBSCRIPTIONS':
      return <CreditCard className={className} />;
    case 'SYNC':
      return <RefreshCw className={className} />;
    default:
      return <LayoutDashboard className={className} />;
  }
}
