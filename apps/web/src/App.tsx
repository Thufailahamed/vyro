import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AdminAuthProvider, AdminShell, RequireAdmin } from './admin/Shell';
import { SupplierShell } from './supplier/Shell';
import { InstallBanner } from './components/InstallBanner';

const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
const MarketingPages = lazy(() => import('./pages/MarketingPages').then((m) => ({ default: m.AboutPage })));
const AboutPage = lazy(() => import('./pages/MarketingPages').then((m) => ({ default: m.AboutPage })));
const HowItWorksPage = lazy(() => import('./pages/MarketingPages').then((m) => ({ default: m.HowItWorksPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const SignupPage = lazy(() => import('./pages/SignupPage').then((m) => ({ default: m.SignupPage })));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })));
const BusinessOnboardingPage = lazy(() => import('./pages/BusinessOnboardingPage').then((m) => ({ default: m.BusinessOnboardingPage })));
const SupplierOnboardingPage = lazy(() => import('./pages/SupplierOnboardingPage').then((m) => ({ default: m.SupplierOnboardingPage })));
const SearchPage = lazy(() => import('./pages/SearchPage').then((m) => ({ default: m.SearchPage })));
const ProductDetailPage = lazy(() => import('./pages/ProductDetailPage').then((m) => ({ default: m.ProductDetailPage })));
const CartPage = lazy(() => import('./pages/CartPage').then((m) => ({ default: m.CartPage })));
const CheckoutPage = lazy(() => import('./pages/CheckoutPage').then((m) => ({ default: m.CheckoutPage })));
const OrdersPage = lazy(() => import('./pages/OrdersPage').then((m) => ({ default: m.OrdersPage })));
const OrderDetailPage = lazy(() => import('./pages/OrderDetailPage').then((m) => ({ default: m.OrderDetailPage })));
const SupplierOrdersPage = lazy(() => import('./pages/SupplierOrdersPage').then((m) => ({ default: m.SupplierOrdersPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const LegalPage = lazy(() => import('./pages/LegalPage').then((m) => ({ default: m.LegalPage })));
const InvoicePage = lazy(() => import('./pages/InvoicePage').then((m) => ({ default: m.InvoicePage })));

const AdminHomePage = lazy(() => import('./admin/HomePage').then((m) => ({ default: m.AdminHomePage })));
const AdminLoginPage = lazy(() => import('./admin/LoginPage').then((m) => ({ default: m.LoginPage })));
const SuppliersPage = lazy(() => import('./admin/Lists').then((m) => ({ default: m.SuppliersPage })));
const BusinessesPage = lazy(() => import('./admin/Lists').then((m) => ({ default: m.BusinessesPage })));
const SupplierDetailPage = lazy(() => import('./admin/SupplierDetailPage').then((m) => ({ default: m.SupplierDetailPage })));
const BusinessDetailPage = lazy(() => import('./admin/BusinessDetailPage').then((m) => ({ default: m.BusinessDetailPage })));
const UsersPage = lazy(() => import('./admin/UsersPage').then((m) => ({ default: m.UsersPage })));
const DisputedPage = lazy(() => import('./admin/DisputedAndAudit').then((m) => ({ default: m.DisputedPage })));
const AuditPage = lazy(() => import('./admin/DisputedAndAudit').then((m) => ({ default: m.AuditPage })));
const RolesPage = lazy(() => import('./admin/RolesPage').then((m) => ({ default: m.RolesPage })));
const AdminActivityPage = lazy(() => import('./admin/AdminActivityPage').then((m) => ({ default: m.AdminActivityPage })));
const InviteAcceptPage = lazy(() => import('./admin/InviteAcceptPage').then((m) => ({ default: m.InviteAcceptPage })));
const CatalogPage = lazy(() => import('./admin/CatalogPage').then((m) => ({ default: m.CatalogPage })));
const AdminProductDetailPage = lazy(() => import('./admin/AdminProductDetailPage').then((m) => ({ default: m.AdminProductDetailPage })));
const MoneyPage = lazy(() => import('./admin/MoneyPage').then((m) => ({ default: m.MoneyPage })));
const TrustSafetyPage = lazy(() => import('./admin/TrustSafetyPage').then((m) => ({ default: m.TrustSafetyPage })));

const SupplierDashboardPage = lazy(() => import('./supplier/DashboardPage').then((m) => ({ default: m.SupplierDashboardPage })));
const SupplierProductsPage = lazy(() => import('./supplier/ProductsPage').then((m) => ({ default: m.SupplierProductsPage })));
const SupplierProductFormPage = lazy(() => import('./supplier/ProductFormPage').then((m) => ({ default: m.SupplierProductFormPage })));
const SupplierPricingPage = lazy(() => import('./supplier/PricingPage').then((m) => ({ default: m.SupplierPricingPage })));
const SupplierInventoryPage = lazy(() => import('./supplier/InventoryPage').then((m) => ({ default: m.SupplierInventoryPage })));
const SupplierAnalyticsPage = lazy(() => import('./supplier/AnalyticsPage').then((m) => ({ default: m.SupplierAnalyticsPage })));
const SupplierCustomersPage = lazy(() => import('./supplier/CustomersPage').then((m) => ({ default: m.SupplierCustomersPage })));
const SupplierDeliveriesPage = lazy(() => import('./supplier/DeliveriesPage').then((m) => ({ default: m.SupplierDeliveriesPage })));
const SupplierPaymentsPage = lazy(() => import('./supplier/PaymentsPage').then((m) => ({ default: m.SupplierPaymentsPage })));
const SupplierSettingsPage = lazy(() => import('./supplier/SettingsPage').then((m) => ({ default: m.SupplierSettingsPage })));

function PageFallback() {
  return (
    <div className="flex items-center justify-center min-h-dvh bg-bone">
      <div className="text-ink-4 text-sm">Loading…</div>
    </div>
  );
}

void MarketingPages;

export default function App() {
  return (
    <>
    <Suspense fallback={<PageFallback />}>
    <Routes>
      {/* Public web SPA */}
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot" element={<ForgotPasswordPage />} />
        <Route path="/reset" element={<ResetPasswordPage />} />
        <Route path="/onboarding/business" element={<BusinessOnboardingPage />} />
        <Route path="/onboarding/supplier" element={<SupplierOnboardingPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/products/:id" element={<ProductDetailPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/:id" element={<OrderDetailPage />} />
        <Route path="/orders/:poId/invoice/:invoiceId" element={<InvoicePage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/legal/terms" element={<LegalPage kind="terms" />} />
        <Route path="/legal/privacy" element={<LegalPage kind="privacy" />} />
        <Route path="/legal/cookies" element={<LegalPage kind="cookies" />} />
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
        <Route path="/admin/invite/accept" element={<InviteAcceptPage />} />
        <Route path="/admin" element={<AdminShell />}>
          <Route index element={<RequireAdmin><AdminHomePage /></RequireAdmin>} />
          <Route path="suppliers" element={<RequireAdmin><SuppliersPage /></RequireAdmin>} />
          <Route path="suppliers/:id" element={<RequireAdmin><SupplierDetailPage /></RequireAdmin>} />
          <Route path="businesses" element={<RequireAdmin><BusinessesPage /></RequireAdmin>} />
          <Route path="businesses/:id" element={<RequireAdmin><BusinessDetailPage /></RequireAdmin>} />
          <Route path="disputed" element={<RequireAdmin><DisputedPage /></RequireAdmin>} />
          <Route path="audit" element={<RequireAdmin><AuditPage /></RequireAdmin>} />
          <Route path="users" element={<RequireAdmin><UsersPage /></RequireAdmin>} />
          <Route path="activity" element={<RequireAdmin><AdminActivityPage /></RequireAdmin>} />
          <Route path="roles" element={<RequireAdmin><RolesPage /></RequireAdmin>} />
          <Route path="catalog" element={<RequireAdmin><CatalogPage /></RequireAdmin>} />
          <Route path="catalog/products/:id" element={<RequireAdmin><AdminProductDetailPage /></RequireAdmin>} />
          <Route path="money" element={<RequireAdmin><MoneyPage /></RequireAdmin>} />
          <Route path="trust-safety" element={<RequireAdmin><TrustSafetyPage /></RequireAdmin>} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>
      </Route>

      {/* Supplier SPA — nested under shared AuthProvider in Layout */}
      <Route path="/supplier" element={<SupplierShell />}>
        <Route index element={<SupplierDashboardPage />} />
        <Route path="orders" element={<SupplierOrdersPage />} />
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
    </Suspense>
    <InstallBanner />
    </>
  );
}
