import Link from 'next/link';
import { CandidLogo } from '@/components/CandidLogo';

export function LandingFooter() {
  return (
    <footer className="mkt-footer">
      <div className="mkt-wrap">
        <div className="mkt-footer-grid">
          <div className="mkt-footer-brand">
            <CandidLogo size="prospect" lockup />
            <p>
              Candid IQ is the business technology &amp; utilities operating system from{' '}
              <a href="https://candid.solutions" target="_blank" rel="noreferrer">
                Candid Solutions
              </a>
              — marketplace, spend intelligence, and Frank, your candid AI that finishes the work.
            </p>
          </div>
          <div>
            <h4>Product</h4>
            <a href="/welcome#product">Marketplace</a>
            <Link href="/welcome/marketplace">Browse providers</Link>
            <a href="/welcome#frank">Meet Frank</a>
            <a href="/welcome#pricing">Pricing</a>
            <Link href="/welcome/partners">Partner platform</Link>
          </div>
          <div>
            <h4>Audiences</h4>
            <a href="/welcome#audiences">Businesses</a>
            <Link href="/welcome/partners">IT &amp; MSP partners</Link>
            <Link href="/welcome/partners">Accountants &amp; advisors</Link>
            <Link href="/welcome/partners">White-label portal</Link>
          </div>
          <div>
            <h4>Company</h4>
            <a href="https://candid.solutions/about/" target="_blank" rel="noreferrer">
              About Candid
            </a>
            <a href="https://candid.solutions/contact-us/" target="_blank" rel="noreferrer">
              Contact
            </a>
            <a href="https://candid.solutions/solutions/" target="_blank" rel="noreferrer">
              Solutions
            </a>
            <Link href="/">Portal sign in</Link>
          </div>
        </div>
        <div className="mkt-footer-bottom">
          <span>© {new Date().getFullYear()} Candid Solutions. All rights reserved.</span>
          <span>Commitment · Innovation · Reputation · Excellence</span>
        </div>
      </div>
    </footer>
  );
}
