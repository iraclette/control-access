import Header from "@/components/Header";
import Footer from "@/components/Footer";

// Public pages get the site header and footer; the staff console has its own frame.
export default function SiteLayout({ children }: LayoutProps<"/[lang]">) {
  return (
    <>
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
