import { Component, OnInit, ViewChild, ElementRef, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from 'environments/environment';
import { AgentWalletService } from './services/agent-wallet.service';
import * as QRCode from 'qrcode';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule } from '@jsverse/transloco';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { AuthModalComponent } from '../../layout/common/auth-modal/auth-modal.component';
import { MarkdownPipe } from '../../shared/pipes/markdown.pipe';

// --- Interfaces ---
interface ToolCall {
  tool: string;
  args: Record<string, any>;
}

interface PaymentRequired {
  price: string;
  priceUsd: number;
  wallet: string;
  details: string;
  receiver_address: string;
  amount: string;
  endpoint?: string;
  toolName?: string;
  requestId?: string;
  serviceId?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  tool_call?: ToolCall;
  payment_required?: PaymentRequired;
  data?: any;
  proof?: string;
  images?: string[];
}

interface ConversationSummary {
  id: string;
  title: string;
  updated_at: string;
}

interface AgentIdentity {
  name: string;
  description: string;
  agentCardURI: string;
  capabilities: string[];
  agentAddress: string;
  createdAt: string;
  active: boolean;
}

interface AgentReputation {
  totalFeedbacks: number;
  averageRating: number;
  totalRatings: number;
}

interface AgentFeedback {
  id: string;
  client: string;
  rating: number;
  tags: string[];
  comment: string;
  verified: boolean;
  timestamp: string;
  paymentProof: string;
}

interface AgentInfo {
  identity: AgentIdentity;
  reputation: AgentReputation | null;
  feedbacks?: AgentFeedback[];
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    TranslocoModule,
    MatDialogModule,
    MarkdownPipe,
  ],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss',
})
export class ChatComponent implements OnInit {
  protected readonly window = window; // Expose window for template
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  baseUrl = environment.baseUrl;
  protected readonly smartAgentUrl = environment.smartAgentUrl;
  private apiUrl = `${environment.smartAgentUrl}/api/agent`;

  // --- Signals ---
  messages = signal<ChatMessage[]>([]);
  userInput = signal('');
  isLoading = signal(false);

  // Wallet & Auth
  walletAddress = signal('');
  walletBalance = signal('0');
  showWalletModal = signal(false);
  chatMode = signal<'x402' | 'credits'>('x402');

  // Agent Info
  showAgentInfoModal = signal(false);
  agentInfo = signal<AgentInfo | null>(null);
  isLoadingAgentInfo = signal(false);
  agentCardUrl = `${this.apiUrl}/agent-card.json`;

  // Feedback & Payment
  showFeedbackModal = signal(false);
  isSubmittingFeedback = signal(false);
  showPaymentConfirmationModal = signal(false);
  pendingPayment = signal<any>(null);
  isProcessingPayment = signal(false);
  showPaymentDetails = signal(false);
  feedbackRating = signal(0);
  feedbackTags = signal<string[]>([]);
  feedbackComment = signal('');
  lastPaymentTx = signal<string | null>(null);
  availableTags = ['fast', 'accurate', 'helpful', 'reliable', 'easy-to-use'];

  // Thinking Simulation
  thinkingSteps = signal<string[]>([]);
  currentThinkingStep = signal('');

  // --- Conversation Management ---
  conversations = signal<ConversationSummary[]>([]);
  currentConversationId = signal<string | null>(null);
  isSidebarOpen = signal(true);
  isRenamingId = signal<string | null>(null); // ID of conversation being renamed
  renameInput = signal('');

  constructor(
    private http: HttpClient,
    public walletService: AgentWalletService,
    private _matDialog: MatDialog,
  ) {}

  async ngOnInit() {
    this.walletAddress.set(this.walletService.getAddress());
    await this.refreshBalance();

    // Load initial data
    this.loadAgentInfo();
    // this.loadConversations(); // MOVED BELOW to ensure mode is set

    // Determine Mode Smartly based on Balances
    const hasWallet = !!this.walletService.getAddress();
    const hasCredits = !!localStorage.getItem('accessToken');
    const walletBalance = parseFloat(this.walletBalance() || '0');

    // Logic:
    // 1. If has credits but no wallet -> Credits
    // 2. If has wallet but no credits -> x402
    // 3. If has both:
    //    - If wallet empty (< 0.01 AVAX) -> Credits
    //    - Else -> x402 (Default)

    if (hasCredits && !hasWallet) {
      this.setChatMode('credits');
    } else if (hasWallet && hasCredits) {
      if (walletBalance < 0.01) {
        this.setChatMode('credits');
      } else {
        this.setChatMode('x402');
      }
    } else if (hasWallet) {
      this.setChatMode('x402');
    }

    // Now load conversations with correct mode/wallet
    this.loadConversations();

    // Restore Session
    const savedId = localStorage.getItem('currentConversationId');
    if (savedId) {
      this.selectConversation(savedId);
    } else {
      this.startNewChat(false); // don't clear again if init
    }
  }

  // --- Conversations Logic ---

  loadConversations() {
    const params: any = {};

    // Strictly filter based on ACTIVE MODE to match creation logic
    if (this.chatMode() === 'x402' && this.walletAddress()) {
      params.walletAddress = this.walletAddress();
    } else if (this.chatMode() === 'credits') {
      // Use User ID as identifier
      params.walletAddress = this.getUserId();
    }

    this.http.get<ConversationSummary[]>(`${this.apiUrl}/conversations`, { params }).subscribe({
      next: (list) => this.conversations.set(list),
      error: (err) => console.error('Failed to load conversations', err),
    });
  }

  selectConversation(id: string) {
    this.currentConversationId.set(id);
    localStorage.setItem('currentConversationId', id);
    this.isLoading.set(true);

    this.http.get<any>(`${this.apiUrl}/history/${id}`).subscribe({
      next: (data) => {
        this.messages.set(data.messages || []);
        this.isLoading.set(false);
        this.scrollToBottom();
      },
      error: (err) => {
        console.error('Failed to load history', err);
        // If 404, clean up
        localStorage.removeItem('currentConversationId');
        this.startNewChat();
        this.isLoading.set(false);
      },
    });
  }

  startNewChat(clearStorage = true) {
    if (clearStorage) {
      localStorage.removeItem('currentConversationId');
    }

    // Reset UI State immediately
    this.currentConversationId.set(null);
    this.userInput.set('');
    this.pendingAttachments.set([]);
    this.thinkingSteps.set([]);
    this.currentThinkingStep.set('');
    this.isLoading.set(false);
    this.messages.set([]);

    // Welcome message
    const identity = this.agentInfo()?.identity;
    const welcomeMsg = identity
      ? `Hello! I am ${identity.name}. ${identity.description} How can I assist you today?`
      : 'Hello! I am your Verifik AI Agent powered by Gemini. I can help you validate identities using the x402 protocol on Avalanche. How can I assist you today?';

    // We show welcome message temporarily.
    this.messages.set([{ role: 'assistant', content: welcomeMsg }]);

    // Persist immediately if this is a user action (clearStorage usually implies reset/new)
    if (clearStorage) {
      const payload = {
        mode: this.chatMode(),
        walletAddress: this.chatMode() === 'credits' ? this.getUserId() : this.walletAddress(),
      };
      this.http.post<any>(`${this.apiUrl}/conversations`, payload).subscribe({
        next: (conv) => {
          // Set the new ID
          this.currentConversationId.set(conv.id);
          localStorage.setItem('currentConversationId', conv.id);
          // Refresh list so it appears in sidebar
          this.loadConversations();
        },
        error: (err) => console.error('Failed to create new chat', err),
      });
    }
  }

  startRenaming(conv: ConversationSummary, event: Event) {
    event.stopPropagation();
    this.isRenamingId.set(conv.id);
    this.renameInput.set(conv.title);
  }

  saveRename(conv: ConversationSummary) {
    const newTitle = this.renameInput().trim();
    if (!newTitle || newTitle === conv.title) {
      this.isRenamingId.set(null);
      return;
    }

    this.http.patch(`${this.apiUrl}/conversations/${conv.id}`, { title: newTitle }).subscribe({
      next: () => {
        // Update local list
        this.conversations.update((list) =>
          list.map((c) => (c.id === conv.id ? { ...c, title: newTitle } : c)),
        );
        this.isRenamingId.set(null);
      },
      error: (err) => console.error('Rename failed', err),
    });
  }

  deleteConversation(conv: ConversationSummary, event: Event) {
    event.stopPropagation();
    if (!confirm('Delete this chat?')) return;

    this.http.delete(`${this.apiUrl}/conversations/${conv.id}`).subscribe({
      next: () => {
        this.conversations.update((list) => list.filter((c) => c.id !== conv.id));
        if (this.currentConversationId() === conv.id) {
          this.startNewChat();
        }
      },
      error: (err) => console.error('Delete failed', err),
    });
  }

  toggleSidebar() {
    this.isSidebarOpen.update((v) => !v);
  }

  // --- Existing Logic ---

  async loadAgentInfo() {
    this.isLoadingAgentInfo.set(true);
    try {
      this.http.get<AgentInfo>(`${this.apiUrl}/info`).subscribe({
        next: (info) => {
          this.agentInfo.set(info);
          this.isLoadingAgentInfo.set(false);
        },
        error: (err) => {
          console.warn('Failed to load agent info:', err);
          this.isLoadingAgentInfo.set(false);
        },
      });
    } catch (error) {
      console.warn('Error loading agent info:', error);
      this.isLoadingAgentInfo.set(false);
    }
  }

  toggleAgentInfoModal() {
    this.showAgentInfoModal.update((show) => !show);
  }

  openAuthModal() {
    this._matDialog.open(AuthModalComponent, {
      panelClass: 'auth-modal-dialog',
      width: '400px',
      maxWidth: '100vw',
    });
  }

  // --- Chat & Sending ---

  setChatMode(mode: 'x402' | 'credits') {
    this.chatMode.set(mode);
  }

  // Image Attachments
  pendingAttachments = signal<string[]>([]); // Base64 strings

  async onPaste(event: ClipboardEvent) {
    const items = event.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            const base64 = await this.fileToBase64(blob);
            this.pendingAttachments.update((current) => [...current, base64]);
          }
        }
      }
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      Array.from(input.files).forEach(async (file) => {
        const base64 = await this.fileToBase64(file);
        this.pendingAttachments.update((current) => [...current, base64]);
      });
    }
    input.value = ''; // Reset input
  }

  removeAttachment(index: number) {
    this.pendingAttachments.update((current) => current.filter((_, i) => i !== index));
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  }

  async sendMessage() {
    const input = this.userInput();
    const images = this.pendingAttachments();

    if (!input.trim() && images.length === 0) return;

    // Check Auth
    const isCredits = this.chatMode() === 'credits';
    const hasWallet = !!this.walletService.getAddress();
    const hasCredits = !!localStorage.getItem('accessToken');

    if (!hasWallet && !hasCredits) {
      this.openAuthModal();
      return;
    }
    if (!isCredits && !hasWallet) {
      this.openAuthModal();
      return;
    }
    if (isCredits && !hasCredits) {
      this.openAuthModal();
      return;
    }

    // Creating a message object to display immediately
    const userMsg: ChatMessage = {
      role: 'user',
      content: input,
      // For display, we might want to show images?
      // Since backend returns URLs later, for now let's show them as data imgs if we wanted.
      // But preserving current structure, we'll wait for backend response or just not show images in USER bubble immediately
      // unless we extend ChatMessage interface.
      // Let's extend ChatMessage interface first? Added `images?: string[]` to interface below.
      images: images,
    };

    this.messages.update((msgs) => [...msgs, userMsg]);

    this.userInput.set('');
    this.pendingAttachments.set([]); // Clear attachments
    this.isLoading.set(true);
    this.scrollToBottom();

    this.startThinkingSimulation();

    try {
      await this.callAgent(input, null, null, images);
    } catch (error: any) {
      this.handleError(error);
    }
  }

  async callAgent(
    message: string,
    paymentTx: string | null = null,
    paymentAmount: string | null = null,
    images: string[] = [],
  ) {
    const isCredits = this.chatMode() === 'credits';
    const userToken = isCredits ? localStorage.getItem('accessToken') : null;

    const payload = {
      message: message,
      conversationId: this.currentConversationId(),
      paymentTx: isCredits ? null : paymentTx,
      paymentWallet: isCredits ? this.getUserId() : this.walletAddress(),
      paymentAmount: isCredits ? null : paymentAmount,
      mode: this.chatMode(),
      userToken: userToken,
      images: images,
    };

    this.http.post<any>(`${this.apiUrl}/chat`, payload).subscribe({
      next: (response) => {
        this.isLoading.set(false);
        this.thinkingSteps.set([]);
        this.currentThinkingStep.set('');

        if (response.conversationId && !this.currentConversationId()) {
          this.currentConversationId.set(response.conversationId);
          localStorage.setItem('currentConversationId', response.conversationId);
          this.loadConversations();
        }

        const msg: ChatMessage = {
          role: response.role,
          content: response.content,
          tool_call: response.tool_call,
          payment_required: response.payment_required,
          data: response.data,
          proof: response.proof,
          images: response.images, // Backend should return image URLs if any were processed/saved
        };

        this.messages.update((msgs) => [...msgs, msg]);
        this.scrollToBottom();

        if (msg.data && msg.role === 'assistant') {
          const paymentMsg = this.messages().find(
            (m) => m.role === 'system' && m.content.includes('TX:'),
          );
          if (paymentMsg) {
            const txMatch = paymentMsg.content.match(/TX: (0x[a-fA-F0-9]+)/);
            if (txMatch) {
              this.lastPaymentTx.set(txMatch[1]);
            }
          }
        }
      },
      error: (err) => {
        this.handleError(err);
      },
    });
  }

  // --- Helpers & Other Modals (Same as before) ---

  private startThinkingSimulation() {
    const steps = [
      'agentThinking.steps.analysing',
      'agentThinking.steps.identifying',
      'agentThinking.steps.checking',
      'agentThinking.steps.consulting',
      'agentThinking.steps.preparing',
    ];
    this.thinkingSteps.set([]);
    this.currentThinkingStep.set('agentThinking.header');

    let i = 0;
    const interval = setInterval(() => {
      if (!this.isLoading() || i >= steps.length) {
        clearInterval(interval);
        return;
      }
      const step = steps[i];
      this.thinkingSteps.update((s) => [...s, step]);
      this.currentThinkingStep.set(step);
      this.scrollToBottom();
      i++;
    }, 800);
  }

  toggleFeedbackModal() {
    this.showFeedbackModal.update((show) => !show);
    if (!this.showFeedbackModal()) {
      this.feedbackRating.set(0);
      this.feedbackTags.set([]);
      this.feedbackComment.set('');
    }
  }

  setRating(rating: number) {
    this.feedbackRating.set(rating);
  }

  toggleTag(tag: string) {
    const currentTags = this.feedbackTags();
    if (currentTags.includes(tag)) {
      this.feedbackTags.set(currentTags.filter((t) => t !== tag));
    } else {
      this.feedbackTags.set([...currentTags, tag]);
    }
  }

  async submitFeedback() {
    // Re-implementation of submitFeedback (kept from original)
    const rating = this.feedbackRating();
    if (rating < 1 || rating > 5) {
      alert('Please select a rating (1-5 stars)');
      return;
    }

    const agentTokenId = 1;
    const tags = this.feedbackTags();
    const comment = this.feedbackComment();
    const paymentTxHash = this.lastPaymentTx();

    this.isSubmittingFeedback.set(true);

    try {
      const tx = await this.walletService.submitFeedback(
        agentTokenId,
        rating,
        tags,
        comment,
        paymentTxHash,
      );
      this.messages.update((msgs) => [
        ...msgs,
        {
          role: 'system',
          content: `Feedback submitted! Transaction: ${tx.hash}. Waiting for confirmation...`,
        },
      ]);
      await tx.wait();
      this.messages.update((msgs) => [
        ...msgs,
        {
          role: 'system',
          content: `✅ Thank you for your feedback! Your rating has been recorded on-chain.`,
        },
      ]);
      await this.loadAgentInfo();
      this.toggleFeedbackModal();
      this.scrollToBottom();
    } catch (error: any) {
      console.error('Error submitting feedback:', error);
      this.handleError(error);
    } finally {
      this.isSubmittingFeedback.set(false);
    }
  }

  refreshBalance() {
    this.walletService.getBalance().then((b) => this.walletBalance.set(b));
  }
  getImageUrl(src: string): string {
    if (!src) return '';
    if (src.startsWith('http') || src.startsWith('data:')) {
      return src;
    }
    if (src.startsWith('/api')) {
      return `${this.smartAgentUrl}${src}`;
    }
    return `${this.baseUrl}${src}`;
  }

  getUserId(): string {
    // Try to get from verifik_account (User Profile) first
    try {
      const accountStr = localStorage.getItem('verifik_account');
      if (accountStr) {
        const account = JSON.parse(accountStr);
        if (account && account._id) return account._id;
      }
    } catch (e) {
      console.warn('Failed to parse verifik_account from local storage');
    }

    // Fallback to token
    const token = localStorage.getItem('accessToken');
    if (!token) return '';
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.clientId || payload._id || payload.id || payload.sub || 'authenticated_user';
    } catch (e) {
      console.error('Failed to parse token', e);
      return 'authenticated_user';
    }
  }

  togglePaymentDetails() {
    this.showPaymentDetails.update((v) => !v);
  }

  confirmPayment(msgIndex: number) {
    const msg = this.messages()[msgIndex];
    if (!msg.payment_required) return;
    this.pendingPayment.set(msg.payment_required);
    this.showPaymentConfirmationModal.set(true);
  }

  cancelPayment() {
    this.showPaymentConfirmationModal.set(false);
    this.pendingPayment.set(null);
  }

  async executePayment() {
    const details = this.pendingPayment();
    if (!details) return;
    this.isProcessingPayment.set(true);
    const amount = details.amount;
    const contractAddress = details.receiver_address;
    const serviceId = details.serviceId || 'cedula-validation';
    const requestId = details.requestId || `req_${Date.now()}`;

    try {
      const { tx } = await this.walletService.payForService(
        contractAddress,
        serviceId,
        requestId,
        amount,
      );
      this.messages.update((msgs) => [
        ...msgs,
        { role: 'system', content: `Payment sent! TX: ${tx.hash}. Waiting for confirmation...` },
      ]);
      this.showPaymentConfirmationModal.set(false);
      this.pendingPayment.set(null);
      await tx.wait();
      this.lastPaymentTx.set(tx.hash);
      await this.callAgent('Payment complete. Please proceed.', tx.hash, amount);
      await this.refreshBalance();
    } catch (error: any) {
      this.handleError(error);
      this.showPaymentConfirmationModal.set(false);
    } finally {
      this.isProcessingPayment.set(false);
    }
  }

  handleError(error: any) {
    this.isLoading.set(false);
    console.error(error);
    this.messages.update((msgs) => [
      ...msgs,
      { role: 'system', content: 'Error: ' + (error.message || 'Something went wrong') },
    ]);
    this.scrollToBottom();
  }

  // Wallet Modal
  walletQrCode = signal<string>('');
  showToast = signal<boolean>(false);
  toastMessage = signal<string>('');

  toggleWalletModal() {
    this.showWalletModal.update((show) => !show);
    if (this.showWalletModal() && this.walletAddress()) {
      this.generateQrCode(this.walletAddress());
    }
  }

  generateQrCode(address: string) {
    QRCode.toDataURL(address, { width: 200, margin: 1 }, (err, url) => {
      if (!err) this.walletQrCode.set(url);
    });
  }

  // Image Preview Modal
  previewImage = signal<string | null>(null);

  openImagePreview(image: string) {
    this.previewImage.set(image);
  }

  closeImagePreview() {
    this.previewImage.set(null);
  }

  async copyAddress() {
    try {
      await navigator.clipboard.writeText(this.walletAddress());
      this.showToastNotification('Address copied to clipboard!');
    } catch (err) {
      console.error(err);
    }
  }

  showToastNotification(message: string) {
    this.toastMessage.set(message);
    this.showToast.set(true);
    setTimeout(() => this.showToast.set(false), 3000);
  }

  async resetWallet() {
    if (confirm('Are you sure you want to reset your wallet?')) {
      this.walletService.resetWallet();
      this.walletAddress.set(this.walletService.getAddress());
      await this.refreshBalance();
      this.showWalletModal.set(false);
      // Reload conversations for new wallet address logic?
      // conversations list depends on wallet address, so yes
      this.loadConversations();
    }
  }

  scrollToBottom(): void {
    setTimeout(() => {
      if (this.scrollContainer) {
        this.scrollContainer.nativeElement.scrollTop =
          this.scrollContainer.nativeElement.scrollHeight;
      }
    }, 100);
  }
}
