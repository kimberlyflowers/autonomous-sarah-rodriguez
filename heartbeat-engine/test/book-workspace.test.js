import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const dashboard = fs.readFileSync(new URL('../dashboard/src/App.jsx', import.meta.url), 'utf8');
const chat = fs.readFileSync(new URL('../src/api/chat.js', import.meta.url), 'utf8');
const books = fs.readFileSync(new URL('../src/api/books.js', import.meta.url), 'utf8');
const bookAuth = fs.readFileSync(new URL('../src/api/book-auth.js', import.meta.url), 'utf8');
const files = fs.readFileSync(new URL('../src/api/files.js', import.meta.url), 'utf8');
const imageTools = fs.readFileSync(new URL('../src/tools/image-tools.js', import.meta.url), 'utf8');

test('Book is a dedicated responsive studio with guided creation and projects', () => {
  assert.match(dashboard, /function BookWorkspace/);
  assert.match(dashboard, /data-testid="book-workspace"/);
  assert.match(dashboard, /\{k:"book",l:"Book"\}/);
  assert.match(dashboard, /data-testid="guided-book-launch"/);
  assert.match(dashboard, /data-testid="owned-book-upload"/);
  assert.match(dashboard, /Upload your own book/);
  assert.match(dashboard, /I confirm that I own this book or have permission/);
  assert.match(dashboard, /sessionType:'book_import'/);
  assert.match(chat, /sessionType === 'book_import'/);
  assert.match(chat, /rightsConfirmed !== true/);
  assert.match(dashboard, /Surprise me/);
  assert.match(dashboard, /Topic or keyword/);
  assert.match(dashboard, /Working title/);
  assert.match(dashboard, /Book description/);
  assert.match(dashboard, /How should the chapters be planned/);
  assert.match(dashboard, /Let Bloomie create the outline/);
  assert.match(dashboard, /I have chapter ideas/);
  assert.match(dashboard, /Chapter outline or directions/);
  assert.match(dashboard, /Requested chapter outline or chapter directions/);
  assert.match(dashboard, /Follow the user's requested chapter outline or chapter directions/);
  assert.match(dashboard, /\['Chapter plan',chapterPlanMode/);
  assert.match(dashboard, /Author name/);
  assert.match(dashboard, /Upload author picture/);
  assert.match(dashboard, /Add a topic or book description, or choose Surprise me/);
  assert.match(dashboard, /label:'Projects'/);
  assert.match(dashboard, /gridTemplateColumns:mob\?'1fr'/);
});

test('Book brief requests a real ten-thousand-word manuscript and cover deliverables', () => {
  assert.match(dashboard, /10,000–10,800 measured words/i);
  assert.match(dashboard, /complete-manuscript\.md/);
  assert.match(dashboard, /01-title-page\.md/);
  assert.match(dashboard, /02-copyright\.md/);
  assert.match(dashboard, /04-table-of-contents\.md/);
  assert.match(dashboard, /05-preface\.md/);
  assert.match(dashboard, /07-introduction\.md/);
  assert.match(dashboard, /91-about-the-author\.md/);
  assert.match(dashboard, /kdp-ebook\.docx/);
  assert.match(dashboard, /kdp-print-interior\.pdf/);
  assert.match(dashboard, /kdp-package-checklist\.md/);
  assert.match(dashboard, /title pages, copyright, optional dedication, TOC, preface/);
  assert.match(dashboard, /chapter files alone.*10,000–10,800 measured words/s);
  assert.match(dashboard, /professional 2:3 portrait front cover/);
  assert.match(dashboard, /five discoverability keywords/);
  assert.match(dashboard, /sessionType:'book_creation'/);
});

test('Book creation requires signed-in authorization and preserves a book project title', () => {
  assert.match(chat, /sessionType === 'book_creation'.*authenticateBookAccess/is);
  assert.match(chat, /title: `📚 \$\{safeBookTitle\}`/);
  assert.match(chat, /\.eq\('user_id', userId\)/);
  assert.match(chat, /sessionType !== 'book_creation'/);
});

test('Book Creator has a separate tenant authorization handshake with shared SSO', () => {
  assert.match(books, /router\.get\('\/access'/);
  assert.match(books, /authenticateBookAccess/);
  assert.match(bookAuth, /client\.auth\.getUser\(token\)/);
  assert.match(bookAuth, /getUserOrgId\(req\)/);
  assert.match(bookAuth, /validateAgentAccess\(req, agentId\)/);
  assert.match(bookAuth, /\.from\('product_entitlements'\)/);
  assert.match(bookAuth, /\['pro', 'enterprise'\]/);
  assert.match(dashboard, /data-testid="book-access-gate"/);
  assert.match(dashboard, /data-whop-checkout-plan-id/);
});

test('Book completion is based on measured artifacts rather than an assistant claim', () => {
  assert.match(chat, /inspectBookDeliverables/);
  assert.match(chat, /wordCount.*10000/s);
  assert.match(chat, /frontMatter/);
  assert.match(chat, /backMatter/);
  assert.match(chat, /titlePage/);
  assert.match(chat, /aboutAuthor/);
  assert.match(chat, /printPdf/);
  assert.match(chat, /kdpChecklist/);
  assert.match(chat, /cannot be marked complete/);
  assert.match(dashboard, /inspectBookArtifacts/);
  assert.match(dashboard, /proof\.complete\?'complete':'working'/);
});

test('Book project includes a navigable reader and in-context section revisions', () => {
  assert.match(dashboard, /data-testid="book-workflow-steps"/);
  assert.match(dashboard, /Preview & Edit/);
  assert.match(dashboard, /Cover & Export/);
  assert.match(dashboard, /data-testid="book-reader-preview"/);
  assert.match(dashboard, /data-testid="book-reader-preview" role="dialog" aria-modal="true"/);
  assert.match(dashboard, /Close book preview/);
  assert.match(dashboard, /Section \{chapterIndex\+1\} of/);
  assert.match(dashboard, /Request section edits/);
  assert.match(dashboard, /BOOK SECTION REVISION REQUEST/);
  assert.match(dashboard, /bookProof\.sections/);
  assert.match(dashboard, /data-testid="book-direct-section-editor"/);
  assert.match(dashboard, /data-testid="book-page-turner"/);
  assert.match(dashboard, /Turn page/);
  assert.match(dashboard, /aspectRatio:'2 \/ 3'/);
  assert.match(dashboard, /of \$\{totalReaderPages\}/);
  assert.match(dashboard, /const turnBookForward=/);
  assert.match(dashboard, /kdpTurnForward/);
  assert.match(dashboard, /kdp-page-turn-forward/);
  assert.match(dashboard, /kdp-page-under/);
  assert.match(dashboard, /kdpCurlLight/);
  assert.match(dashboard, /Front cover/);
  assert.match(dashboard, /Back cover/);
  assert.match(dashboard, /Edit cover/);
  assert.match(dashboard, /coverIsWrap/);
  assert.match(dashboard, /HTMLFlipBook/);
  assert.match(dashboard, /flippingTime=\{1050\}/);
  assert.match(dashboard, /flipNext\('bottom'\)/);
  assert.match(dashboard, /data-testid="book-selection-editor"/);
  assert.match(dashboard, /BOOK PREVIEW SELECTION EDIT/);
  assert.match(dashboard, /Add image/);
  assert.match(dashboard, /data-testid="book-audience-workflow-choice"/);
  assert.match(dashboard, /Children's book/);
  assert.match(dashboard, /illustration-plan\.md/);
  assert.match(dashboard, /data-testid="book-preview-zoom-controls"/);
  assert.match(dashboard, /Fit page/);
  assert.match(dashboard, /Fit width/);
  assert.match(dashboard, /function BookSuiteIcon/);
  assert.match(dashboard, /<BookSuiteIcon name=\{item\.icon\}/);
  assert.doesNotMatch(dashboard, /label:'Home',icon:'⌂'/);
  assert.doesNotMatch(dashboard, />☰<\/button>/);
  assert.match(dashboard, /Edit directly/);
  assert.match(dashboard, /Save section/);
  assert.match(dashboard, /\/api\/files\/artifacts\/\$\{activeSection\.fileId\}/);
  assert.match(dashboard, /without using AI credits/);
  assert.match(dashboard, /data-testid="book-preview-empty-state"/);
  assert.match(dashboard, /Book reader and editor/);
  assert.match(dashboard, /Your book preview will appear here/);
  assert.match(dashboard, /data-testid="book-preview-empty-state" style=\{\{width:'100%',maxWidth:1180/);
  assert.match(dashboard, /data-testid="book-reader-preview"[\s\S]*?maxWidth:1000/);
});

test('Shared Bloom Studio image routing uses current stable image models', () => {
  assert.match(imageTools, /google\/gemini-3\.1-flash-image/);
  assert.match(imageTools, /model: 'gpt-image-2'/);
  assert.match(imageTools, /formData\.append\('model', 'gpt-image-2'\)/);
  assert.doesNotMatch(imageTools, /gemini-3\.1-flash-image-preview/);
  assert.doesNotMatch(imageTools, /gpt-image-1\.5/);
});

test('Direct artifact edits remain tenant scoped', () => {
  assert.match(files, /router\.put\('\/artifacts\/:fileId'/);
  assert.match(files, /const resolvedOrgId = await getUserOrgId\(req\)/);
  assert.match(files, /\.eq\('organization_id', resolvedOrgId\)/);
});

test('Book production visibly advances through timed section states', () => {
  assert.match(dashboard, /data-testid="book-generation-timing"/);
  assert.match(dashboard, /Elapsed \{bookElapsed\}/);
  assert.match(dashboard, /Typical estimate/);
  assert.match(dashboard, /data-book-step-state/);
  assert.match(dashboard, /generating/);
  assert.match(dashboard, /LIVE BOOK SECTION/);
});

test('Saved books and artifacts are loaded through tenant-scoped authenticated APIs', () => {
  assert.match(dashboard, /getAuthHeaders\(\)/);
  assert.match(dashboard, /\/api\/chat\/sessions\?agentId=/);
  assert.match(dashboard, /startsWith\('📚 '\)/);
  assert.match(dashboard, /\/api\/files\/artifacts\?sessionId=/);
  assert.match(dashboard, /deriveBookProjectState/);
  assert.match(dashboard, /\['Projects',projects\.length\]/);
  assert.match(dashboard, /\['Books',projects\.filter\(project=>project\.bookState==='complete'\)\.length\]/);
  assert.match(dashboard, /project\.coverUrl\|\|'\/assets\/book-studio-stage-bestseller\.png'/);
  assert.match(dashboard, /bookProjectStateLabel/);
  assert.match(dashboard, /\['all','All'\],\['in_progress','Pending'\],\['needs_attention','Needs review'\],\['complete','Completed'\]/);
  assert.match(dashboard, /filteredProjects/);
});

test('Quick-Launch Booster has distinct entitlement-gated resources in the book workspace', () => {
  assert.match(books, /router\.get\('\/booster'/);
  assert.match(books, /\['booster', 'pro', 'enterprise'\]/);
  assert.match(books, /Kindle Cash Multiplier Training/);
  assert.match(books, /Amazon KDP Optimization Checklist/);
  assert.match(books, /Done-For-You Book Description Templates/);
  assert.match(books, /30 Books in 30 Days Fast-Start Blueprint/);
  assert.match(dashboard, /data-testid="book-booster-library"/);
  assert.match(dashboard, /Add Quick-Launch Booster — \$9\.95/);
  assert.match(dashboard, /plan:'book_creator_booster'/);
  assert.match(dashboard, /label:'Library'/);
  assert.match(dashboard, /Your Library/);
  assert.match(dashboard, /data-testid="book-dashboard-bonuses"/);
  assert.match(dashboard, /data-placement="above-the-fold"/);
  assert.match(dashboard, /\{content\}\s*\{libraryReader&&<LibraryBookReader/);
  assert.match(dashboard, /Your included bonuses/);
  assert.match(dashboard, /Your books/);
  assert.match(dashboard, /BOOK_BONUS_LIBRARY/);
  assert.match(dashboard, /FINISHED_BOOK_LIBRARY/);
  assert.match(dashboard, /Conquer Your Doubts: A Guide to Unshakeable Confidence/);
  assert.match(dashboard, /Read full book/);
  assert.match(dashboard, /Edit with Bloomie/);
  assert.match(dashboard, /Download PDF/);
  assert.match(dashboard, /data-testid="library-book-reader"/);
  assert.match(dashboard, /className="bloom-real-book"/);
  assert.match(dashboard, /pdfjsLib\.getDocument/);
  const appEntry = fs.readFileSync(new URL('../dashboard/src/main.jsx', import.meta.url), 'utf8');
  assert.match(appEntry, /typeof URL\.parse !== 'function'/);
  assert.match(appEntry, /URL\.parse = \(input, base\)/);
  assert.match(dashboard, /canvas\.toDataURL\('image\/jpeg',0\.94\)/);
  assert.match(dashboard, /alt=\{`Page \$\{pageNumber\}`\}/);
  assert.match(dashboard, /const scale=Math\.min\(maxWidth\/viewport\.width,maxHeight\/viewport\.height\)/);
  assert.match(dashboard, /width=\{readerSize\.width\} height=\{readerSize\.height\}/);
  assert.match(dashboard, /<HTMLFlipBook/);
  assert.match(books, /kindle-cash-multiplier-complete\.pdf/);
  assert.match(books, /amazon-kdp-checklist-complete\.pdf/);
  assert.match(books, /book-description-templates-complete\.pdf/);
  assert.match(books, /30-books-blueprint-complete\.pdf/);
});

test('All five project workflow steps and Create choice cards are wired', () => {
  assert.match(dashboard, /\['setup','1','Setup'\]/);
  assert.match(dashboard, /\['outline','2','Outline'\]/);
  assert.match(dashboard, /\['chapters','3','Chapters'\]/);
  assert.match(dashboard, /\['preview','4','Preview & Edit'\]/);
  assert.match(dashboard, /\['publish','5','Cover & Export'\]/);
  assert.match(dashboard, /data-testid="book-project-setup-stage"/);
  assert.match(dashboard, /Continue to outline/);
  assert.match(dashboard, /data-testid=\{`book-create-option-\$\{key\}`\}/);
  assert.match(dashboard, /aria-pressed=\{startMode===key\}/);
});

test('Book Studio exposes a reusable tenant-scoped Author Library', () => {
  assert.match(books, /book_author_profiles/);
  assert.match(books, /router\.get\('\/authors'/);
  assert.match(books, /router\.post\('\/authors'/);
  assert.match(books, /organization_id: access\.organizationId/);
  assert.match(dashboard, /Author Library/);
  assert.match(dashboard, /Save reusable author/);
  assert.match(dashboard, /\[authorForm\.sample,'writing_style'/);
  assert.match(dashboard, /Approved author reference IDs/);
});

test('Book production renders live stages, progress narration, and verified artifacts', () => {
  assert.match(dashboard, /data-testid="book-live-production-console"/);
  assert.match(dashboard, /data-testid="book-production-theater"/);
  assert.match(dashboard, /LIVE BOOK SECTION/);
  assert.match(dashboard, /PLANNING STAGE/);
  assert.match(dashboard, /OUTLINE PREVIEW/);
  assert.match(dashboard, /Waiting for outline/);
  assert.match(dashboard, /each completed book section will appear here in reading order/);
  assert.match(dashboard, /coverPreviewUrl/);
  assert.match(dashboard, /LIVE BOOK ASSEMBLY/);
  assert.match(dashboard, /<LiveProgressNarration c=\{c\} sessionId=\{active\.id\}/);
  assert.match(dashboard, /<ActiveTaskTracker c=\{c\} sessionId=\{active\.id\}/);
  assert.match(dashboard, /\['Brief',true,'Concept locked'\]/);
  assert.match(dashboard, /\['KDP files',bookProof\.docx&&bookProof\.printPdf&&bookProof\.kdpChecklist/);
});

test('Research, agent, audio, POD, and cover tools execute through authenticated project sessions', () => {
  assert.match(dashboard, /const runBookTool=async/);
  assert.match(dashboard, /BOOK MARKET RESEARCH REQUEST/);
  assert.match(dashboard, /AUDIOBOOK PRODUCTION REQUEST/);
  assert.match(dashboard, /PRINT-ON-DEMAND PRODUCTION REQUEST/);
  assert.match(dashboard, /BOOK COVER GENERATION REQUEST/);
  assert.match(dashboard, /book-cover-revision-workspace/);
  assert.match(dashboard, /BOOK COVER REVISION REQUEST/);
  assert.match(dashboard, /Generate revision with RunPod/);
  assert.match(dashboard, /engine "runpod"/);
  assert.match(dashboard, /sessionType:`book_\$\{section\}`/);
});
