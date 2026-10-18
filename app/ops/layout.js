import Link from "next/link";
import styles from "./ops.module.css";

export const metadata = {
  title: "Second Look: ops console",
};

export default function OpsLayout({ children }) {
  return (
    <div className={styles.shell}>
      <div className={styles.banner} role="note">
        Demo console, synthetic data only
      </div>
      <header className={styles.header}>
        <Link href="/ops" className={styles.brand}>
          Second Look · Case review
        </Link>
        <nav className={styles.headerNav}>
          <Link href="/evaluation" className={styles.headerLink}>
            Evaluation
          </Link>
          <Link href="/" className={styles.headerLink}>
            Customer page
          </Link>
        </nav>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
