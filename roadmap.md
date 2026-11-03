# Repository import
- [x] Download and inspect the requested repository safely.
- [x] Import source, assets, routes and required packages while preserving project bindings.
- [x] Verify homepage, navigation and sign-in screens on desktop and phone.
- [x] Check the imported app: build succeeds and 17 focused tests pass.
- [x] Connect the Neon database (linked, 194 tables reachable).
- [x] Google Wallet + Apple-ready wallet card and 3D ROUT Card (already present; tests and type check pass).
- [ ] Live wallet signing (blocked: Google/Apple wallet certificates not provided).

# Identity hardening
- [x] Wallet: handle-independent pass serials; public endpoints refuse account ids.
- [x] Public profiles: sealed owner reference and sealed avatar links instead of account ids.
- [x] Scoped subjects table (oidc_subjects) live with unique rules.
- [x] HKDF subject vault for all app tokens; raw account id never in a token.
- [x] Per-app profile photo proxy.
- [ ] Own account id still used by Studio/dashboard screens in the browser (needs server-side rewrite).
- [ ] Verifiable credentials (SD-JWT VC) and scoped DID documents.
- [ ] 3D PASS card blueprint (dual QR, MRZ, hologram shaders) from the uploaded document.
