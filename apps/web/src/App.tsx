import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AdminAuthProvider, AdminShell, RequireAdmin } from './admin/Shell';
import { SupplierShell } from './supplier/Shell';
import { InstallBanner } from './components/InstallBanner';
import { RedirectIfAuthed, RequireAuth, RequireBusiness } from './components/RequireAuth';

const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
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
const PaymentReturnPage = lazy(() => import('./pages/PaymentReturnPage').then((m) => ({ default: m.PaymentReturnPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));
const AskPage = lazy(() => import('./ask/AskPage').then((m) => ({ default: m.AskPage })));
const AiHomePage = lazy(() => import('./ai/AiHomePage').then((m) => ({ default: m.AiHomePage })));
const AdminAIUsagePage = lazy(() => import('./pages/AdminAIUsagePage').then((m) => ({ default: m.AdminAIUsagePage })));
const InvoiceUploadPage = lazy(() => import('./pages/InvoiceUploadPage').then((m) => ({ default: m.InvoiceUploadPage })));
const InvoiceListPage = lazy(() => import('./pages/InvoiceListPage').then((m) => ({ default: m.InvoiceListPage })));
const InvoiceReviewPage = lazy(() => import('./pages/InvoiceReviewPage').then((m) => ({ default: m.InvoiceReviewPage })));

const AdminHomePage = lazy(() => import('./admin/HomePage').then((m) => ({ default: m.AdminHomePage })));
const AdminLoginPage = lazy(() => import('./admin/LoginPage').then((m) => ({ default: m.LoginPage })));
const SuppliersPage = lazy(() => import('./admin/Lists').then((m) => ({ default: m.SuppliersPage })));
const BusinessesPage = lazy(() => import('./admin/Lists').then((m) => ({ default: m.BusinessesPage })));
const SupplierDetailPage = lazy(() => import('./admin/SupplierDetailPage').then((m) => ({ default: m.SupplierDetailPage })));
const BusinessDetailPage = lazy(() => import('./admin/BusinessDetailPage').then((m) => ({ default: m.BusinessDetailPage })));
const UsersPage = lazy(() => import('./admin/UsersPage').then((m) => ({ default: m.UsersPage })));
const DisputedPage = lazy(() => import('./admin/DisputedAndAudit').then((m) => ({ default: m.DisputedPage })));
const RolesPage = lazy(() => import('./admin/RolesPage').then((m) => ({ default: m.RolesPage })));
const AdminActivityPage = lazy(() => import('./admin/AdminActivityPage').then((m) => ({ default: m.AdminActivityPage })));
const InviteAcceptPage = lazy(() => import('./admin/InviteAcceptPage').then((m) => ({ default: m.InviteAcceptPage })));
const CatalogPage = lazy(() => import('./admin/CatalogPage').then((m) => ({ default: m.CatalogPage })));
const AdminProductDetailPage = lazy(() => import('./admin/AdminProductDetailPage').then((m) => ({ default: m.AdminProductDetailPage })));
const MoneyPage = lazy(() => import('./admin/MoneyPage').then((m) => ({ default: m.MoneyPage })));
const TrustSafetyPage = lazy(() => import('./admin/TrustSafetyPage').then((m) => ({ default: m.TrustSafetyPage })));
const PlatformPage = lazy(() => import('./admin/PlatformPage').then((m) => ({ default: m.PlatformPage })));
const SecurityPage = lazy(() => import('./admin/SecurityPage').then((m) => ({ default: m.SecurityPage })));
const ObservabilityPage = lazy(() => import('./admin/ObservabilityPage').then((m) => ({ default: m.ObservabilityPage })));

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
        <Route path="/login" element={<RedirectIfAuthed><LoginPage /></RedirectIfAuthed>} />
        <Route path="/signup" element={<RedirectIfAuthed><SignupPage /></RedirectIfAuthed>} />
        <Route path="/forgot" element={<ForgotPasswordPage />} />
        <Route path="/reset" element={<ResetPasswordPage />} />
        <Route path="/onboarding/business" element={<RequireAuth><BusinessOnboardingPage /></RequireAuth>} />
        <Route path="/onboarding/supplier" element={<RequireAuth><SupplierOnboardingPage /></RequireAuth>} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/products/:id" element={<ProductDetailPage />} />
        <Route path="/cart" element={<RequireBusiness><CartPage /></RequireBusiness>} />
        <Route path="/checkout" element={<RequireBusiness><CheckoutPage /></RequireBusiness>} />
        <Route path="/orders" element={<RequireAuth><OrdersPage /></RequireAuth>} />
        <Route path="/orders/:id" element={<RequireAuth><OrderDetailPage /></RequireAuth>} />
        <Route
          path="/orders/:id/payment-success"
          element={<RequireAuth><PaymentReturnPage outcome="success" /></RequireAuth>}
        />
        <Route
          path="/orders/:id/payment-cancel"
          element={<RequireAuth><PaymentReturnPage outcome="cancel" /></RequireAuth>}
        />
        <Route path="/orders/:poId/invoice/:invoiceId" element={<RequireAuth><InvoicePage /></RequireAuth>} />
        <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
        <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
        <Route path="/ask" element={<RequireAuth><AskPage /></RequireAuth>} />
        <Route path="/ai" element={<RequireAuth><AiHomePage /></RequireAuth>} />
        <Route path="/admin/ai-usage" element={<RequireAuth><AdminAIUsagePage /></RequireAuth>} />
        <Route path="/invoices/upload" element={<RequireAuth><InvoiceUploadPage /></RequireAuth>} />
        <Route path="/invoices" element={<RequireAuth><InvoiceListPage /></RequireAuth>} />
        <Route path="/invoices/:id/review" element={<RequireAuth><InvoiceReviewPage /></RequireAuth>} />
        <Route path="/notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
        <Route path="/legal/terms" element={<LegalPage kind="terms" />} />
        <Route path="/legal/privacy" element={<LegalPage kind="privacy" />} />
        <Route path="/legal/cookies" element={<LegalPage kind="cookies" />} />
        {/* Buyer-portal 404 — keeps the chrome so the user can navigate out. */}
        <Route path="*" element={<NotFoundPage />} />
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
          <Route path="audit" element={<Navigate to="/admin/activity" replace />} />
          <Route path="users" element={<RequireAdmin><UsersPage /></RequireAdmin>} />
          <Route path="activity" element={<RequireAdmin><AdminActivityPage /></RequireAdmin>} />
          <Route path="roles" element={<RequireAdmin><RolesPage /></RequireAdmin>} />
          <Route path="catalog" element={<RequireAdmin><CatalogPage /></RequireAdmin>} />
          <Route path="catalog/products/:id" element={<RequireAdmin><AdminProductDetailPage /></RequireAdmin>} />
          <Route path="money" element={<RequireAdmin><MoneyPage /></RequireAdmin>} />
          <Route path="trust-safety" element={<RequireAdmin><TrustSafetyPage /></RequireAdmin>} />
          <Route path="platform" element={<RequireAdmin><PlatformPage /></RequireAdmin>} />
          <Route path="security" element={<RequireAdmin><SecurityPage /></RequireAdmin>} />
          <Route path="observability" element={<RequireAdmin><ObservabilityPage /></RequireAdmin>} />
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

      {/* Global fallback — the buyer Layout route above already owns "*", so this
          only catches paths outside every shell. */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </Suspense>
    <InstallBanner />
    </>
  );
}
