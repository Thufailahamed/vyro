import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { AboutPage, HowItWorksPage } from './pages/MarketingPages';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { BusinessOnboardingPage } from './pages/BusinessOnboardingPage';
import { SupplierOnboardingPage } from './pages/SupplierOnboardingPage';
import { SearchPage } from './pages/SearchPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { CartPage } from './pages/CartPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { OrdersPage } from './pages/OrdersPage';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { SupplierOrdersPage } from './pages/SupplierOrdersPage';
import { ProfilePage } from './pages/ProfilePage';
import { DashboardPage } from './pages/DashboardPage';
import { NotificationsPage } from './pages/NotificationsPage';

import { AdminAuthProvider, AdminShell, RequireAdmin } from './admin/Shell';
import { AdminHomePage } from './admin/HomePage';
import { LoginPage as AdminLoginPage } from './admin/LoginPage';
import { SuppliersPage, BusinessesPage } from './admin/Lists';
import { SupplierDetailPage } from './admin/SupplierDetailPage';
import { BusinessDetailPage } from './admin/BusinessDetailPage';
import { UsersPage } from './admin/UsersPage';
import { DisputedPage, AuditPage } from './admin/DisputedAndAudit';

import { SupplierShell } from './supplier/Shell';
import { SupplierDashboardPage } from './supplier/DashboardPage';
import { SupplierProductsPage } from './supplier/ProductsPage';
import { SupplierProductFormPage } from './supplier/ProductFormPage';
import { SupplierPricingPage } from './supplier/PricingPage';
import { SupplierInventoryPage } from './supplier/InventoryPage';
import { SupplierAnalyticsPage } from './supplier/AnalyticsPage';
import { SupplierCustomersPage } from './supplier/CustomersPage';
import { SupplierDeliveriesPage } from './supplier/DeliveriesPage';
import { SupplierPaymentsPage } from './supplier/PaymentsPage';
import { SupplierSettingsPage } from './supplier/SettingsPage';

export default function App() {
  return (
    <Routes>
      {/* Public web SPA */}
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/onboarding/business" element={<BusinessOnboardingPage />} />
        <Route path="/onboarding/supplier" element={<SupplierOnboardingPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/products/:id" element={<ProductDetailPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/:id" element={<OrderDetailPage />} />
        <Route path="/supplier/orders" element={<SupplierOrdersPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>

      {/* Admin SPA — shared AdminAuthProvider */}
      <Route
        element={
          <AdminAuthProvider>
            <Outlet />
          </AdminAuthProvider>
        }
      >
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminShell />}>
          <Route index element={<RequireAdmin><AdminHomePage /></RequireAdmin>} />
          <Route path="suppliers" element={<RequireAdmin><SuppliersPage /></RequireAdmin>} />
          <Route path="suppliers/:id" element={<RequireAdmin><SupplierDetailPage /></RequireAdmin>} />
          <Route path="businesses" element={<RequireAdmin><BusinessesPage /></RequireAdmin>} />
          <Route path="businesses/:id" element={<RequireAdmin><BusinessDetailPage /></RequireAdmin>} />
          <Route path="disputed" element={<RequireAdmin><DisputedPage /></RequireAdmin>} />
          <Route path="audit" element={<RequireAdmin><AuditPage /></RequireAdmin>} />
          <Route path="users" element={<RequireAdmin><UsersPage /></RequireAdmin>} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>
      </Route>

      {/* Supplier SPA — nested under shared AuthProvider in Layout */}
      <Route path="/supplier" element={<SupplierShell />}>
        <Route index element={<SupplierDashboardPage />} />
        <Route path="products" element={<SupplierProductsPage />} />
        <Route path="products/new" element={<SupplierProductFormPage mode="create" />} />
        <Route path="products/:id/edit" element={<SupplierProductFormPage mode="edit" />} />
        <Route path="pricing" element={<SupplierPricingPage />} />
        <Route path="inventory" element={<SupplierInventoryPage />} />
        <Route path="analytics" element={<SupplierAnalyticsPage />} />
        <Route path="customers" element={<SupplierCustomersPage />} />
        <Route path="deliveries" element={<SupplierDeliveriesPage />} />
        <Route path="payments" element={<SupplierPaymentsPage />} />
        <Route path="settings" element={<SupplierSettingsPage />} />
        <Route path="*" element={<Navigate to="/supplier" replace />} />
      </Route>
    </Routes>
  );
}
