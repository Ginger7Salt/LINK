<template>
  <section v-if="conversation && character" class="screen no-tabs chat-room" :style="chatSurfaceStyle">
    <ChatHeader
      :character="character"
      mode="online"
      :offline-disabled="chatActionLocked"
      @offline="enterOffline"
      @search="openChatSearch"
      @open-menu="openChatSettings"
    />

    <section v-if="activeListenTogether" class="listen-status-strip" aria-label="一起听状态">
      <img :src="character.avatar" alt="" aria-hidden="true" />
      <span>正在和{{ characterDisplayName }}一起听</span>
      <button class="listen-status-track" type="button" @click="goToMusicPage">
        <strong>{{ activeListenTrackLabel }}</strong>
      </button>
      <button class="listen-status-close" type="button" aria-label="关闭一起听" @click="showStopListenConfirm = true">
        <X :size="13" />
      </button>
    </section>

    <main ref="messageListRef" class="message-list" :style="messageListStyle" @scroll="handleMessageListScroll">
      <div v-if="hasEarlierMessages" class="history-loader">上滑加载更早消息</div>
      <MessageBubble
        v-for="(message, index) in onlineMessages"
        :key="message.id"
        :message="message"
        :character="character"
        :user="conversationUser ?? undefined"
        :appearance="chatSettings.appearance"
        :hide-avatar="shouldHideAvatar(index)"
        :profile-alert="hasUnreadMindState"
        :can-regenerate-image="canRegenerateChatImage"
        :regenerating-image="regeneratingChatImageMessageIds.includes(message.id)"
        :selection-mode="selectionMode"
        :selected="isMessageSelected(message)"
        :can-quote="canQuoteMessage(message)"
        @apply-image="applyChatImageCandidate"
        @accept-music-listen-invite="acceptMusicListenInvite(message)"
        @accept-offline-invitation="acceptOfflineInvitation(message)"
        @accept-transfer="respondToTransfer(message.id, 'accepted')"
        @busy-action="store.showConfigAlert"
        @long-press="openMessageActions"
        @open-card-detail="openCardDetail"
        @open-profile="openCharacterProfile"
        @open-user-profile="openUserProfile"
        @quote-message="quoteMessage"
        @regenerate-image="regenerateChatImage"
        @reject-music-listen-invite="rejectMusicListenInvite(message)"
        @reject-offline-invitation="rejectOfflineInvitation(message)"
        @reject-transfer="respondToTransfer(message.id, 'rejected')"
        @toggle-select="toggleMessageSelection(message)"
      />
      <div v-if="currentConversationReplying" class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
    </main>

    <section v-if="selectionMode" class="selection-toolbar">
      <button class="secondary-action" type="button" @click="cancelSelection">
        <X :size="16" />
        <span>取消</span>
      </button>
      <strong>已选 {{ selectedMessageCount }} 条</strong>
      <button class="danger-action" type="button" :disabled="!selectedMessageCount" @click="deleteSelectedMessages">
        <Trash2 :size="16" />
        <span>删除</span>
      </button>
    </section>

    <MessageComposer
      ref="composerRef"
      :model-value="composerText"
      :can-send-reply="true"
      :disabled="currentConversationReplying"
      :input-disabled="false"
      online
      placeholder="Aa"
      :quote="quoteTarget"
      :sticker-suggestions="composerStickerSuggestions"
      @cancel-quote="quoteTarget = null"
      @draft-text="handleComposerDraftText"
      @prepare-focus="captureKeyboardScrollAnchor"
      @focus="handleComposerFocus"
      @blur="handleComposerBlur"
      @capture-photo="sendCapturedPhoto"
      @open-image-panel="openImagePanel"
      @open-menu="showActionMenu = true"
      @open-stickers="openStickerPanel"
      @open-voice-panel="openVoicePanel"
      @reply="sendAndReply"
      @send="sendBubble"
      @send-sticker="sendStickerSuggestion"
    />

    <input ref="localImageInputRef" class="hidden-file-input" type="file" accept="image/*" @change="sendLocalImageFromInput" />

    <AppModal v-model="showImagePanel" title="发送图片" :show-header="false" variant="ins">
      <section class="image-send-panel">
        <div class="image-panel-head">
          <div>
            <p>Image</p>
            <h3>发送图片给 {{ characterDisplayName }}</h3>
          </div>
        </div>
        <nav class="image-tabs" aria-label="图片发送方式">
          <button type="button" :class="{ active: imageSendTab === 'local' }" @click="imageSendTab = 'local'">本地图片发送</button>
          <button type="button" :class="{ active: imageSendTab === 'description' }" @click="imageSendTab = 'description'">文字描述卡片</button>
        </nav>

        <section v-if="imageSendTab === 'local'" class="local-image-tab">
          <label class="description-field local-image-hint-field">
            <span>图片补充描述（可选）</span>
            <textarea v-model="localImageHintDraft" maxlength="500" rows="3" placeholder="可以写画面重点、场景、人物或你希望 AI 理解到的细节。"></textarea>
          </label>
          <button class="local-image-button" type="button" :disabled="sendingImage" @click="localImageInputRef?.click()">
            <span>{{ sendingImage ? '处理中' : '选择本地图片' }}</span>
          </button>
          <p>图片会以真实图片发送，支持后续模型识图。</p>
        </section>

        <section v-else class="description-image-tab">
          <figure class="description-preview">
            <figcaption>{{ imageDescriptionDraft.trim() || '写一段画面描述，发送后会显示成模拟图片卡片。' }}</figcaption>
          </figure>
          <label class="description-field">
            <span>图片描述</span>
            <textarea v-model="imageDescriptionDraft" maxlength="500" rows="5" placeholder="例如：傍晚便利店门口的自拍，玻璃上有暖色灯光反射，手里拿着一瓶冰咖啡。"></textarea>
          </label>
          <button class="description-send-button" type="button" :disabled="sendingImage || !imageDescriptionDraft.trim()" @click="sendDescriptionImage">
            {{ sendingImage ? '发送中' : '发送描述卡片' }}
          </button>
        </section>
      </section>
    </AppModal>

    <AppModal v-model="showVoicePanel" title="发送语音" :show-header="false" variant="ins">
      <section class="voice-send-panel">
        <div class="voice-panel-head">
          <div>
            <p>Voice</p>
            <h3>发送语音给 {{ characterDisplayName }}</h3>
          </div>
        </div>
        <nav class="voice-tabs" aria-label="语音发送方式">
          <button type="button" :disabled="recordingVoice" :class="{ active: voiceSendTab === 'record' }" @click="voiceSendTab = 'record'">录音语音</button>
          <button type="button" :disabled="recordingVoice" :class="{ active: voiceSendTab === 'text' }" @click="voiceSendTab = 'text'">文字语音</button>
        </nav>

        <section v-if="voiceSendTab === 'record'" class="voice-record-tab">
          <div class="voice-recorder-card" :class="{ recording: recordingVoice, ready: recordedVoiceDraft }">
            <strong>{{ voiceRecordStatus }}</strong>
            <span>{{ formatVoiceDuration(recordedVoiceSeconds) }}</span>
            <div class="voice-preview-wave" aria-hidden="true">
              <span></span><span></span><span></span><span></span><span></span>
            </div>
          </div>
          <label class="voice-text-field">
            <span>语音内容</span>
            <textarea v-model="voiceTranscriptDraft" maxlength="500" rows="4" placeholder="输入这条语音要表达的内容"></textarea>
          </label>
          <div class="voice-actions">
            <button v-if="!recordingVoice" class="voice-secondary" type="button" :disabled="currentConversationReplying" @click="startVoiceRecording">
              {{ recordedVoiceDraft ? '重录' : '开始录音' }}
            </button>
            <button v-else class="voice-secondary voice-secondary--stop" type="button" @click="stopVoiceRecording">停止</button>
            <button class="voice-primary" type="button" :disabled="!recordedVoiceDraft || !voiceTranscriptDraft.trim() || currentConversationReplying || recordingVoice" @click="sendRecordedVoice">发送语音</button>
          </div>
        </section>

        <section v-else class="voice-text-tab">
          <div class="voice-text-preview">
            <div class="voice-preview-wave" aria-hidden="true">
              <span></span><span></span><span></span><span></span><span></span>
            </div>
            <strong>{{ formatVoiceDuration(textVoiceDuration) }}</strong>
          </div>
          <label class="voice-text-field">
            <span>语音内容</span>
            <textarea v-model="voiceTextDraft" maxlength="500" rows="5" placeholder="输入要作为语音发送的内容"></textarea>
          </label>
          <button class="voice-primary" type="button" :disabled="!voiceTextDraft.trim() || currentConversationReplying" @click="sendTextVoice">发送语音</button>
        </section>
      </section>
    </AppModal>

    <AppModal v-model="showActionMenu" title="更多操作" :show-header="false" variant="ins">
      <section class="action-menu">
        <button type="button" @click="openCharacterProfile">
          <span>角色主页</span>
        </button>
        <button type="button" @click="openProfileThemes">
          <span>主页自定义</span>
        </button>
        <button type="button" @click="openUserProfile">
          <span>我的主页</span>
        </button>
        <button type="button" :disabled="chatActionLocked" @click="openLocationPanel">
          <span>发送定位</span>
        </button>
        <button type="button" :disabled="chatActionLocked" @click="openTransferPanel">
          <span>转账</span>
        </button>
        <button type="button" :disabled="chatActionLocked" @click="openMusicListenInvitePanel">
          <span>邀请一起听</span>
        </button>
        <button type="button" @click="openModelSwitch">
          <span>模型切换</span>
        </button>
        <button type="button" :class="{ busy: currentConversationReplying }" :aria-disabled="currentConversationReplying" @click="regenerateReply">
          <span>重新回复</span>
        </button>
        <button type="button" :disabled="chatActionLocked" @click="openNarrationPanel">
          <span>添加旁白</span>
        </button>
        <button type="button" @click="openGobangPlaceholder">
          <span>五子棋</span>
        </button>
        <button type="button" :class="{ busy: generatingVoom }" :aria-disabled="generatingVoom" @click="generateVoomPost">
          <span>{{ generatingVoom ? '生成中' : '生成 VOOM' }}</span>
        </button>
        <button type="button" @click="openSmallTheater">
          <span>小剧场</span>
        </button>
        <button class="danger-menu-action" type="button" :disabled="chatActionLocked" @click="openDeleteFriendConfirm">
          <span>删除好友</span>
        </button>
        <button class="danger-menu-action" type="button" :disabled="chatActionLocked" @click="openClearHistoryConfirm">
          <span>清空记忆</span>
        </button>
      </section>
    </AppModal>

    <AppModal v-model="showMusicListenPanel" title="邀请一起听" :show-header="false" variant="ins">
      <section class="listen-invite-send-panel">
        <div class="listen-panel-head">
          <div>
            <p>Listen Together</p>
            <h3>邀请 {{ characterDisplayName }} 一起听</h3>
          </div>
        </div>
        <section class="listen-compose-preview" aria-label="一起听邀请预览">
          <span class="listen-preview-disc" aria-hidden="true">
            <img v-if="musicInviteTrack?.coverUrl" :src="musicInviteTrack.coverUrl" alt="" />
          </span>
          <span class="listen-preview-copy">
            <small>LINK FM</small>
            <strong>{{ musicInviteTrack?.name || '一起听歌' }}</strong>
            <span>{{ musicInviteTrackArtists }}</span>
          </span>
        </section>
        <label class="listen-field">
          <span>邀请备注（可选）</span>
          <input v-model="musicListenNoteDraft" maxlength="80" placeholder="例如：这首想和你一起听" />
        </label>
        <div class="listen-actions-sheet">
          <button class="secondary-action" type="button" @click="showMusicListenPanel = false">取消</button>
          <button class="primary-action" type="button" :disabled="chatActionLocked" @click="sendMusicListenInviteMessage">发送邀请</button>
        </div>
      </section>
    </AppModal>

    <AppModal v-model="showStopListenConfirm" title="关闭一起听" :show-header="false" variant="ins">
      <section class="listen-stop-confirm">
        <span>Listen Together</span>
        <h3>结束和{{ characterDisplayName }}的一起听？</h3>
        <p>关闭后聊天状态栏会消失，音乐页也不再显示对方的一起听状态。</p>
        <div class="listen-stop-actions">
          <button class="secondary-action" type="button" @click="showStopListenConfirm = false">取消</button>
          <button class="primary-action" type="button" @click="confirmStopListenTogether">关闭</button>
        </div>
      </section>
    </AppModal>

    <AppModal v-model="showRegeneratePrompt" title="重新回复引导" :show-header="false" variant="ins">
      <form class="regenerate-prompt-sheet" @submit.prevent="confirmRegenerateReply">
        <span>重新回复</span>
        <h3>引导这次回复</h3>
        <p>可以写剧情方向、禁止事项或语气要求；留空会按当前上下文直接重新生成。</p>
        <label>
          <span>可选引导</span>
          <textarea v-model="regeneratePromptDraft" maxlength="600" rows="5" placeholder="例如：往暧昧拉扯走；不要让角色立刻服软；禁止出现道歉。"></textarea>
        </label>
        <div class="regenerate-prompt-actions">
          <button class="secondary-action" type="button" @click="showRegeneratePrompt = false">取消</button>
          <button class="primary-action" type="submit" :disabled="currentConversationReplying">重新回复</button>
        </div>
      </form>
    </AppModal>

    <AppModal v-model="showLocationPanel" title="发送定位" :show-header="false" variant="ins">
      <section class="location-send-panel">
        <div class="location-panel-head">
          <div>
            <p>Location</p>
            <h3>发送定位给 {{ characterDisplayName }}</h3>
          </div>
        </div>

        <section class="link-location-card location-preview-card" aria-label="定位预览">
          <span class="link-location-map" aria-hidden="true">
            <span class="link-map-road link-map-road-1"></span>
            <span class="link-map-road link-map-road-2"></span>
            <span class="link-map-road link-map-road-3"></span>
            <span class="link-map-road link-map-road-4"></span>
            <span class="link-map-block link-map-block-1"></span>
            <span class="link-map-block link-map-block-2"></span>
            <span class="link-map-block link-map-block-3"></span>
            <span class="link-map-label link-map-label-top">{{ locationPreviewMapLabel }}</span>
            <span class="link-map-label link-map-label-mid">{{ locationPreviewName }}</span>
            <span class="link-map-pin link-map-pin-main"></span>
            <span class="link-map-pin link-map-pin-secondary"></span>
            <span class="link-map-google"><span>G</span><span>o</span><span>o</span><span>g</span><span>l</span><span>e</span></span>
          </span>
          <span class="link-location-body">
            <span class="link-location-kicker">Location</span>
            <strong>{{ locationPreviewName }}</strong>
            <span v-if="locationPreviewAddress" class="link-location-detail-address">{{ locationPreviewAddress }}</span>
          </span>
          <span class="link-location-footer">
            <span class="link-location-footer-mark" aria-hidden="true"></span>
            <span>{{ locationPreviewDistanceLabel }}</span>
            <span class="link-location-chevron" aria-hidden="true"></span>
          </span>
        </section>

        <label class="location-field">
          <span>地理位置</span>
          <input v-model="locationNameDraft" maxlength="80" placeholder="例如：市图书馆三楼自习区" />
        </label>
        <label class="location-field">
          <span>详细地址（可选）</span>
          <input v-model="locationAddressDraft" maxlength="140" placeholder="例如：XX路 88 号 / 北门附近" />
        </label>
        <label class="location-field">
          <span>距离角色的位置</span>
          <input v-model="locationDistanceDraft" maxlength="60" placeholder="例如：约 2.4 公里 / 步行 12 分钟" />
        </label>

        <div class="location-actions">
          <button class="secondary-action" type="button" @click="showLocationPanel = false">取消</button>
          <button class="primary-action" type="button" :disabled="!canSendLocation || chatActionLocked" @click="sendLocationMessage">发送定位</button>
        </div>
      </section>
    </AppModal>

    <AppModal v-model="showTransferPanel" title="转账" :show-header="false" variant="ins">
      <section class="transfer-send-panel">
        <div class="transfer-panel-head">
          <div>
            <p>Transfer</p>
            <h3>转账给 {{ characterDisplayName }}</h3>
          </div>
        </div>

        <section class="transfer-compose-preview" aria-label="转账预览">
          <span class="transfer-compose-head">
            <span class="transfer-compose-brand">
              <span aria-hidden="true">¥</span>
              <span>LINK Pay</span>
            </span>
            <span>待发送</span>
          </span>
          <span class="transfer-compose-main">
            <small>转账给</small>
            <strong>¥{{ transferAmountPreview }}</strong>
            <span>{{ characterDisplayName }}</span>
          </span>
          <span class="transfer-compose-note">{{ transferPreviewSummary }}</span>
        </section>

        <label class="transfer-field">
          <span>金额</span>
          <input v-model="transferAmountDraft" inputmode="decimal" maxlength="12" placeholder="例如 52.00" />
        </label>
        <label class="transfer-field">
          <span>备注（可选）</span>
          <input v-model="transferNoteDraft" maxlength="60" placeholder="例如：奶茶钱 / 路费 / 今天辛苦了" />
        </label>

        <div class="transfer-actions-sheet">
          <button class="secondary-action" type="button" @click="showTransferPanel = false">取消</button>
          <button class="primary-action" type="button" :disabled="!canSendTransfer || chatActionLocked" @click="sendTransferMessage">发送转账</button>
        </div>
      </section>
    </AppModal>

    <AppModal v-model="showNarrationPanel" title="添加旁白" :show-header="false" variant="ins">
      <section class="narration-send-panel">
        <div class="narration-panel-head">
          <div>
            <p>Narration</p>
            <h3>添加系统旁白</h3>
          </div>
        </div>
        <label class="narration-field">
          <span>旁白内容</span>
          <textarea v-model="narrationDraft" maxlength="500" rows="5" placeholder="例如：窗外忽然下起雨，聊天界面短暂安静下来。"></textarea>
        </label>
        <div class="narration-actions">
          <button class="secondary-action" type="button" @click="showNarrationPanel = false">取消</button>
          <button class="primary-action" type="button" :disabled="!narrationDraft.trim() || chatActionLocked" @click="sendNarrationMessage">发送旁白</button>
        </div>
      </section>
    </AppModal>

    <AppModal v-model="showMessageMenu" title="消息操作" :show-header="false" variant="ins">
      <section class="message-action-menu">
        <button type="button" @click="copyActiveMessage">
          <span>复制</span>
        </button>
        <button type="button" @click="deleteActiveMessage">
          <span>删除</span>
        </button>
        <button type="button" @click="startSelectionFromActive">
          <span>多选</span>
        </button>
        <button type="button" :disabled="!canFavoriteActiveMessage || isActiveMessageFavorited" @click="favoriteActiveMessage">
          <span>{{ favoriteActionLabel }}</span>
        </button>
        <button type="button" :disabled="!canRecallActiveMessage" @click="recallActiveMessage">
          <span>撤回</span>
        </button>
        <button v-if="canRegenerateActiveVoice" type="button" :disabled="regeneratingActiveVoice" @click="regenerateActiveVoice">
          <span>{{ regeneratingActiveVoice ? '生成中' : '重新生成语音' }}</span>
        </button>
        <button type="button" :disabled="!canQuoteActiveMessage" @click="quoteActiveMessage">
          <span>引用</span>
        </button>
        <button type="button" :disabled="!canEditActiveMessage" @click="openEditActiveMessage">
          <span>编辑</span>
        </button>
      </section>
    </AppModal>

    <AppModal v-model="showEditModal" title="编辑消息" :show-header="false" variant="ins">
      <section class="edit-message-sheet">
        <template v-if="activeMessage?.location">
          <label class="location-field">
            <span>地点名称</span>
            <input v-model="editLocationNameDraft" maxlength="80" placeholder="地点名称" />
          </label>
          <label class="location-field">
            <span>详细地址</span>
            <input v-model="editLocationAddressDraft" maxlength="140" placeholder="详细地址可留空" />
          </label>
          <label class="location-field">
            <span>距离</span>
            <input v-model="editLocationDistanceDraft" maxlength="60" placeholder="距离对方多远" />
          </label>
        </template>
        <template v-else-if="activeMessage?.transfer">
          <label class="transfer-field">
            <span>金额</span>
            <input v-model="editTransferAmountDraft" inputmode="decimal" maxlength="12" placeholder="例如 52.00" />
          </label>
          <label class="transfer-field">
            <span>备注</span>
            <input v-model="editTransferNoteDraft" maxlength="60" placeholder="备注可留空" />
          </label>
          <label class="transfer-field">
            <span>处理状态</span>
            <select v-model="editTransferStatusDraft">
              <option v-if="!activeMessageTransferIsReceipt" value="pending">待处理</option>
              <option value="accepted">已接收</option>
              <option value="rejected">已拒绝</option>
            </select>
          </label>
        </template>
        <textarea v-else v-model="editDraft" rows="5" placeholder="编辑消息内容"></textarea>
        <div class="edit-actions">
          <button class="secondary-action" type="button" @click="showEditModal = false">取消</button>
          <button class="primary-action" type="button" :disabled="!canSaveEditedMessage" @click="saveEditedMessage">保存</button>
        </div>
      </section>
    </AppModal>

    <AppModal v-model="showDeleteConfirm" title="确认删除" :show-header="false" variant="ins">
      <section class="delete-confirm-sheet">
        <h3>删除消息？</h3>
        <p>删除后 AI 不会再读取这部分信息。</p>
        <div class="delete-confirm-actions">
          <button class="secondary-action" type="button" @click="cancelDeleteConfirm">取消</button>
          <button class="danger-action" type="button" @click="confirmDeleteMessages">删除</button>
        </div>
      </section>
    </AppModal>

    <AppModal v-model="showDeleteFriendConfirm" title="确认删除" :show-header="false" variant="ins">
      <section class="delete-confirm-sheet">
        <h3>删除好友？</h3>
        <p>会同时删除与 {{ characterDisplayName }} 的聊天记录、线下 RP、关联 VOOM，以及角色当前绑定的所有局部世界书，删除后不可恢复。</p>
        <div class="delete-confirm-actions">
          <button class="secondary-action" type="button" :disabled="deletingFriend" @click="showDeleteFriendConfirm = false">取消</button>
          <button class="danger-action" type="button" :disabled="deletingFriend || chatActionLocked" @click="confirmDeleteFriend">{{ deletingFriend ? '删除中' : '删除好友' }}</button>
        </div>
      </section>
    </AppModal>

    <AppModal v-model="showClearHistoryConfirm" title="确认清空" :show-header="false" variant="ins">
      <section class="delete-confirm-sheet">
        <h3>清空 {{ characterDisplayName }} 的记忆？</h3>
        <p>会删除该角色的线上聊天、线下 RP、VOOM 关联、记忆手册、主页展示资料和心境状态；好友、聊天设置、角色基础资料和绑定局部世界书都会保留。</p>
        <div class="delete-confirm-actions">
          <button class="secondary-action" type="button" :disabled="clearingHistory" @click="showClearHistoryConfirm = false">取消</button>
          <button class="danger-action" type="button" :disabled="clearingHistory || chatActionLocked" @click="confirmClearHistory">{{ clearingHistory ? '清空中' : '确认清空' }}</button>
        </div>
      </section>
    </AppModal>

    <AppModal v-model="showUserProfile" title="我的主页" :show-header="false" variant="profile-ins">
      <UserProfileSheet v-if="conversationUser" :user="conversationUser" :posts="store.sortedVoomPosts" @save="saveUserProfile" />
    </AppModal>

    <AppModal v-model="showProfile" title="角色主页" :show-header="false" variant="profile-ins">
      <CharacterProfileSheet
        v-if="character"
        :character="character"
        :posts="store.sortedVoomPosts"
        @save="saveCharacterProfile"
        @delete-history-entry="deleteCharacterProfileHistoryEntry"
        @clear-history="clearCharacterProfileHistory"
      />
    </AppModal>
    <StickerLibraryModal
      v-model="showStickers"
      :conversation-id="props.id"
      :disabled="chatActionLocked"
      :recommendation-query="composerText"
      :recommended-stickers="stickerModalRecommendations"
      @panel-height-change="handleStickerPanelHeightChange"
    />
    <ChatModelSwitchPanel v-model="showModelSwitch" :conversation-id="props.id" />

  </section>
  <section v-else class="screen no-tabs empty-state">会话不存在</section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Trash2, X } from 'lucide-vue-next';
import AppModal from '@/components/common/AppModal.vue';
import ChatHeader from '@/components/chat/ChatHeader.vue';
import ChatModelSwitchPanel from '@/components/chat/ChatModelSwitchPanel.vue';
import CharacterProfileSheet from '@/components/chat/CharacterProfileSheet.vue';
import MessageBubble from '@/components/chat/MessageBubble.vue';
import MessageComposer from '@/components/chat/MessageComposer.vue';
import UserProfileSheet from '@/components/chat/UserProfileSheet.vue';
import StickerLibraryModal from '@/components/stickers/StickerLibraryModal.vue';
import { useAppStore } from '@/stores/appStore';
import { useMusicPlayerStore } from '@/stores/musicPlayerStore';
import type { CharacterProfile, ChatImageAttachment, ChatLocationAttachment, ChatMessage, ChatMessageQuote, ChatTransferStatus, ChatVoiceAttachment, Sticker, UserProfile } from '@/types/domain';
import { getCharacterDisplayName } from '@/utils/character';
import { readChatImageFile } from '@/utils/imageFile';
import { useKeyboardScrollGuard } from '@/utils/keyboardScrollGuard';
import { normalizeUserProfile, normalizeVisualProfile } from '@/utils/profile';
import { getSelectedImageModelOption } from '@/utils/settings';
import { RECOMMENDED_STICKER_LIMIT, recommendStickers } from '@/utils/stickerRecommendations';
import { isVoomNarrationMessage, mergeVoomLikeMessages } from '@/utils/voomMessages';

type BrowserSpeechRecognitionAlternative = {
  transcript: string;
};

type BrowserSpeechRecognitionResult = {
  isFinal: boolean;
  length: number;
  [index: number]: BrowserSpeechRecognitionAlternative | undefined;
};

type BrowserSpeechRecognitionResultList = {
  length: number;
  [index: number]: BrowserSpeechRecognitionResult | undefined;
};

type BrowserSpeechRecognitionEvent = Event & {
  resultIndex: number;
  results: BrowserSpeechRecognitionResultList;
};

type BrowserSpeechRecognitionErrorEvent = Event & {
  error?: string;
};

type BrowserSpeechRecognition = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor;
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
};

type MessageComposerExpose = {
  focusInput: () => void;
};

const voiceTranscriptLimit = 500;
const composerDraftStoragePrefix = 'link.chat.composerDraft.';
const composerDrafts = new Map<string, string>();

function composerDraftKey(conversationId: string) {
  return `${composerDraftStoragePrefix}${conversationId}`;
}

function readComposerDraft(conversationId: string) {
  if (composerDrafts.has(conversationId)) return composerDrafts.get(conversationId) ?? '';
  try {
    return window.sessionStorage.getItem(composerDraftKey(conversationId)) ?? '';
  } catch {
    return '';
  }
}

function writeComposerDraft(conversationId: string, content: string) {
  composerDrafts.set(conversationId, content);
  try {
    const key = composerDraftKey(conversationId);
    if (content) window.sessionStorage.setItem(key, content);
    else window.sessionStorage.removeItem(key);
  } catch {}
}

const props = defineProps<{
  id: string;
}>();

const store = useAppStore();
const musicPlayer = useMusicPlayerStore();
const router = useRouter();
const route = useRoute();
const showProfile = ref(false);
const showUserProfile = ref(false);
const showActionMenu = ref(false);
const showRegeneratePrompt = ref(false);
const showModelSwitch = ref(false);
const showStickers = ref(false);
const stickerPanelHeight = ref(0);
const showImagePanel = ref(false);
const showVoicePanel = ref(false);
const showLocationPanel = ref(false);
const showTransferPanel = ref(false);
const showMusicListenPanel = ref(false);
const showStopListenConfirm = ref(false);
const showNarrationPanel = ref(false);
const showMessageMenu = ref(false);
const showEditModal = ref(false);
const showDeleteConfirm = ref(false);
const showDeleteFriendConfirm = ref(false);
const showClearHistoryConfirm = ref(false);
const generatingVoom = ref(false);
const deletingFriend = ref(false);
const clearingHistory = ref(false);
const regeneratingChatImageMessageIds = ref<string[]>([]);
const regeneratingVoiceMessageIds = ref<string[]>([]);
const messageListRef = ref<HTMLElement | null>(null);
const composerRef = ref<MessageComposerExpose | null>(null);
const localImageInputRef = ref<HTMLInputElement | null>(null);
const activeMessage = ref<ChatMessage | null>(null);
const selectionMode = ref(false);
const selectedMessageIds = ref<string[]>([]);
const quoteTarget = ref<ChatMessageQuote | null>(null);
const composerFocused = ref(false);
const composerText = ref(readComposerDraft(props.id));
const editDraft = ref('');
const editLocationNameDraft = ref('');
const editLocationAddressDraft = ref('');
const editLocationDistanceDraft = ref('');
const editTransferAmountDraft = ref('');
const editTransferNoteDraft = ref('');
const editTransferStatusDraft = ref<ChatTransferStatus>('pending');
const pendingDeleteIds = ref<string[]>([]);
const pendingDeleteFromSelection = ref(false);
const visibleMessageLimit = ref(60);
const loadingEarlierMessages = ref(false);
const imageSendTab = ref<'local' | 'description'>('local');
const localImageHintDraft = ref('');
const imageDescriptionDraft = ref('');
const sendingImage = ref(false);
const voiceSendTab = ref<'record' | 'text'>('record');
const voiceTranscriptDraft = ref('');
const voiceTextDraft = ref('');
const locationNameDraft = ref('');
const locationAddressDraft = ref('');
const locationDistanceDraft = ref('');
const transferAmountDraft = ref('');
const transferNoteDraft = ref('');
const musicListenNoteDraft = ref('');
const narrationDraft = ref('');
const regeneratePromptDraft = ref('');
const recordedVoiceDraft = ref<Pick<ChatVoiceAttachment, 'audioUrl' | 'duration' | 'mimeType'> | null>(null);
const recordingVoice = ref(false);
const recordingStartedAt = ref(0);
const recordingElapsed = ref(0);
const recognizingVoice = ref(false);
const voiceRecognitionNotice = ref('');
let voiceRecorder: MediaRecorder | null = null;
let voiceStream: MediaStream | null = null;
let voiceChunks: Blob[] = [];
let voiceRecognition: BrowserSpeechRecognition | null = null;
let voiceTimer: number | undefined;
let proactiveReplyTimer: number | undefined;
let bottomRestoreQueued = false;
let bottomRestoreTimeouts: number[] = [];
let discardRecording = false;
let voiceRecognitionStartText = '';
let voiceRecognitionFinalText = '';
let voiceRecognitionStopping = false;
let voiceRecognitionRunId = 0;

const initialMessageLimit = 60;
const messageLoadStep = 30;
const topLoadThreshold = 48;
const bottomStickThreshold = 72;
const bottomRestoreDelays = [40, 120, 260, 520];

const conversation = computed(() => store.conversationById(props.id));
const character = computed(() => (conversation.value ? store.characterById(conversation.value.charId) : undefined));
const characterDisplayName = computed(() => character.value ? getCharacterDisplayName(character.value) : '该好友');
const boundUser = computed(() => {
  const userId = conversation.value?.userId || character.value?.boundUserId || '';
  return userId ? store.userById(userId) ?? null : null;
});
const conversationUser = computed(() => {
  const user = boundUser.value;
  if (!user) return null;

  const profile = normalizeVisualProfile(character.value?.boundUserProfile, user);
  return {
    ...user,
    avatar: profile.avatar || user.avatar,
    nickname: user.nickname,
    signature: user.signature,
    profile: normalizeVisualProfile({
      ...profile,
      nickname: user.nickname,
      bio: user.signature
    }, user)
  };
});
const chatSettings = computed(() => store.settingsForConversation(props.id));
const allOnlineMessages = computed(() => {
  const messages = store.messagesForConversation(props.id).filter((message) => message.mode === 'online');
  const displayMessages = messages.filter((message) => !isVoomNarrationMessage(message));
  return mergeVoomLikeMessages(displayMessages);
});
const onlineMessages = computed(() => allOnlineMessages.value.slice(Math.max(0, allOnlineMessages.value.length - visibleMessageLimit.value)));
const hasEarlierMessages = computed(() => visibleMessageLimit.value < allOnlineMessages.value.length);

function shouldHideAvatar(index: number) {
  if (!chatSettings.value.appearance.showOnlyFirstAvatarInReply) return false;
  const message = onlineMessages.value[index];
  const previousMessage = onlineMessages.value[index - 1];
  return Boolean(message && previousMessage && message.sender !== 'system' && message.sender === previousMessage.sender);
}

const chatSurfaceStyle = computed(() => ({
  backgroundColor: chatSettings.value.appearance.backgroundColor,
  backgroundImage: chatSettings.value.appearance.backgroundImage ? `url(${chatSettings.value.appearance.backgroundImage})` : 'none',
  '--sticker-panel-offset': `${stickerPanelHeight.value}px`
}));
const messageListStyle = computed(() => ({
  backgroundColor: 'transparent',
  backgroundImage: 'none'
}));
const currentConversationReplying = computed(() => store.isConversationReplying(props.id));
const selectedMessageCount = computed(() => selectedMessageIds.value.length);
const hasUnreadMindState = computed(() => Boolean(character.value?.mindState?.lines.length
  && character.value.mindState.updatedAt > character.value.mindState.readAt));
const activeMessageIsSynthetic = computed(() => Boolean(activeMessage.value?.id.includes('__')));
const activeMessageTransferIsReceipt = computed(() => Boolean(activeMessage.value?.transfer?.responseToMessageId));
const canRecallActiveMessage = computed(() => Boolean(activeMessage.value && activeMessage.value.sender === 'user' && !activeMessageIsSynthetic.value));
const canQuoteActiveMessage = computed(() => Boolean(activeMessage.value && canQuoteMessage(activeMessage.value)));
const canEditActiveMessage = computed(() => Boolean(activeMessage.value && !activeMessageIsSynthetic.value && !activeMessageTransferIsReceipt.value && !activeMessage.value.musicListenInvite && !activeMessage.value.theaterLink));
const canFavoriteActiveMessage = computed(() => Boolean(activeMessage.value && !activeMessageIsSynthetic.value && store.canFavoriteMessage(activeMessage.value)));
const isActiveMessageFavorited = computed(() => Boolean(activeMessage.value && store.isMessageFavorited(activeMessage.value.id)));
const favoriteActionLabel = computed(() => {
  if (isActiveMessageFavorited.value) return '已收藏';
  if (!canFavoriteActiveMessage.value) return '不可收藏';
  return '收藏';
});
const canRegenerateActiveVoice = computed(() => Boolean(activeMessage.value?.sender === 'char'
  && activeMessage.value.voice?.transcript.trim()
  && !activeMessageIsSynthetic.value));
const regeneratingActiveVoice = computed(() => Boolean(activeMessage.value && regeneratingVoiceMessageIds.value.includes(activeMessage.value.id)));
const canRegenerateChatImage = computed(() => Boolean(getSelectedImageModelOption(store.settings, 'onlineChat')));
const recordedVoiceSeconds = computed(() => recordingVoice.value
  ? Math.max(1, Math.round(recordingElapsed.value))
  : recordedVoiceDraft.value?.duration ?? 0);
const textVoiceDuration = computed(() => estimateVoiceDuration(voiceTextDraft.value));
const voiceRecordStatus = computed(() => {
  if (recordingVoice.value) {
    if (recognizingVoice.value) return '正在录音 · 转文字中';
    if (voiceRecognitionNotice.value) return `正在录音 · ${voiceRecognitionNotice.value}`;
    return '正在录音';
  }
  if (recordedVoiceDraft.value) return '录音已就绪';
  return '等待录音';
});
const canSendLocation = computed(() => Boolean(locationNameDraft.value.trim() && locationDistanceDraft.value.trim()));
const normalizedTransferAmount = computed(() => transferAmountDraft.value.replace(/[￥¥,\s]/g, '').trim());
const transferAmountPreview = computed(() => normalizedTransferAmount.value || '0.00');
const canSendTransfer = computed(() => /^\d+(?:\.\d{1,2})?$/.test(normalizedTransferAmount.value) && Number(normalizedTransferAmount.value) > 0);
const locationPreviewName = computed(() => locationNameDraft.value.trim() || '地点名称');
const locationPreviewAddress = computed(() => locationAddressDraft.value.trim());
const locationPreviewDistance = computed(() => locationDistanceDraft.value.trim() || '未知');
const locationPreviewDistanceLabel = computed(() => `距离对方 ${locationPreviewDistance.value}`);
const locationPreviewMapLabel = computed(() => createLinkMapLabel(locationPreviewAddress.value || locationPreviewName.value, locationPreviewName.value));
const transferPreviewSummary = computed(() => transferNoteDraft.value.trim() || '添加备注后会随转账一起显示');
const musicInviteTrack = computed(() => musicPlayer.currentTrack);
const musicInviteTrackArtists = computed(() => musicInviteTrack.value?.artists.join(' / ') || '会从当前播放或音乐页继续');
const activeListenTogether = computed(() => Boolean(conversation.value && musicPlayer.isListeningWithConversation(props.id)));
const activeListenTrackLabel = computed(() => {
  const track = musicPlayer.currentTrack;
  if (!track) return '等待选歌';
  return `${track.name}-${track.artists.join('/') || '未知歌手'}`;
});
const chatActionLocked = computed(() => currentConversationReplying.value);
const stickerRecommendationBase = computed(() => {
  if (!chatSettings.value.stickerSuggestionsEnabled) return [];
  return recommendStickers({
    query: composerText.value,
    stickers: store.stickers,
    groups: store.sortedStickerGroups,
    messages: store.messagesForConversation(props.id),
    conversationId: props.id,
    boundGroupIds: chatSettings.value.characterStickerGroupIds,
    limit: RECOMMENDED_STICKER_LIMIT
  });
});
const composerStickerSuggestions = computed(() => composerText.value.trim() ? stickerRecommendationBase.value.slice(0, 6) : []);
const stickerModalRecommendations = computed(() => chatSettings.value.stickerSuggestionsEnabled ? stickerRecommendationBase.value : []);
const normalizedEditTransferAmount = computed(() => editTransferAmountDraft.value.replace(/[￥¥,\s]/g, '').trim());
const canSaveEditedMessage = computed(() => {
  const message = activeMessage.value;
  if (!message) return false;
  if (message.location) return Boolean(editLocationNameDraft.value.trim() && editLocationDistanceDraft.value.trim());
  if (message.transfer) return /^\d+(?:\.\d{1,2})?$/.test(normalizedEditTransferAmount.value)
    && Number(normalizedEditTransferAmount.value) > 0
    && (!activeMessageTransferIsReceipt.value || editTransferStatusDraft.value !== 'pending');
  return Boolean(editDraft.value.trim());
});
const { captureKeyboardScrollAnchor, releaseKeyboardScrollGuard, startKeyboardScrollGuard, stopKeyboardScrollGuard } = useKeyboardScrollGuard(messageListRef);

function isMessageListNearBottom() {
  const messageList = messageListRef.value;
  if (!messageList) return false;
  const bottomOffset = Math.max(0, messageList.scrollHeight - messageList.clientHeight - messageList.scrollTop);
  return bottomOffset <= bottomStickThreshold;
}

function scrollMessagesToBottomNow() {
  const messageList = messageListRef.value;
  if (!messageList) return;
  messageList.scrollTop = messageList.scrollHeight;
}

function clearQueuedBottomRestores() {
  bottomRestoreTimeouts.forEach((timerId) => window.clearTimeout(timerId));
  bottomRestoreTimeouts = [];
}

function restoreMessagesToBottomAfterLayout() {
  clearQueuedBottomRestores();
  scrollMessagesToBottomNow();
  window.requestAnimationFrame(scrollMessagesToBottomNow);
  bottomRestoreTimeouts = bottomRestoreDelays.map((delay) => window.setTimeout(scrollMessagesToBottomNow, delay));
}

function focusComposerInput() {
  captureKeyboardScrollAnchor();
  composerRef.value?.focusInput();
  void nextTick(() => {
    composerRef.value?.focusInput();
    queueMessagesToBottomAfterLayout();
  });
  window.setTimeout(() => {
    composerRef.value?.focusInput();
    queueMessagesToBottomAfterLayout();
  }, 80);
}

function queueMessagesToBottomAfterLayout() {
  if (bottomRestoreQueued) return;
  bottomRestoreQueued = true;
  void nextTick(() => {
    bottomRestoreQueued = false;
    restoreMessagesToBottomAfterLayout();
  });
}

async function syncConversationState(id: string) {
  await store.markConversationRead(id);
  const currentConversation = store.conversationById(id);
  if (currentConversation?.activeMode !== 'online') {
    await store.updateConversationMode(id, 'online');
  }
}

async function scrollMessagesToBottom() {
  await nextTick();
  restoreMessagesToBottomAfterLayout();
}

function focusedMessageId() {
  const value = route.query.focus;
  if (Array.isArray(value)) return value[0] ?? '';
  return typeof value === 'string' ? value : '';
}

async function scrollToOnlineMessage(messageId: string) {
  const targetIndex = allOnlineMessages.value.findIndex((message) => message.id === messageId);
  if (targetIndex < 0) return false;
  visibleMessageLimit.value = Math.max(visibleMessageLimit.value, allOnlineMessages.value.length - targetIndex);
  await nextTick();
  const target = messageListRef.value?.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
  if (!target) return false;
  target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  target.classList.add('message-focus-pulse');
  window.setTimeout(() => target.classList.remove('message-focus-pulse'), 1400);
  return true;
}

function handleComposerFocus() {
  const shouldStickToBottom = isMessageListNearBottom();
  composerFocused.value = true;
  startKeyboardScrollGuard();
  if (shouldStickToBottom) queueMessagesToBottomAfterLayout();
}

function handleComposerBlur() {
  composerFocused.value = false;
  stopKeyboardScrollGuard();
}

function handleComposerDraftText(content: string) {
  const shouldStickToBottom = composerFocused.value || isMessageListNearBottom();
  composerText.value = content;
  writeComposerDraft(props.id, content);
  if (shouldStickToBottom) queueMessagesToBottomAfterLayout();
}

function blurActiveKeyboardInput() {
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement || activeElement instanceof HTMLSelectElement) {
    activeElement.blur();
  }
}

function openStickerPanel() {
  const shouldStickToBottom = composerFocused.value || isMessageListNearBottom();
  blurActiveKeyboardInput();
  showStickers.value = true;
  if (shouldStickToBottom) queueMessagesToBottomAfterLayout();
}

function handleStickerPanelHeightChange(height: number) {
  const previousHeight = stickerPanelHeight.value;
  if (previousHeight === height) return;
  const shouldStickToBottom = showStickers.value && (previousHeight === 0 || isMessageListNearBottom());
  stickerPanelHeight.value = height;
  if (shouldStickToBottom) queueMessagesToBottomAfterLayout();
}

function resetMessageWindow() {
  visibleMessageLimit.value = initialMessageLimit;
}

async function loadEarlierMessages() {
  const messageList = messageListRef.value;
  if (!messageList || !hasEarlierMessages.value || loadingEarlierMessages.value) return;
  loadingEarlierMessages.value = true;
  const previousScrollHeight = messageList.scrollHeight;
  const previousScrollTop = messageList.scrollTop;
  visibleMessageLimit.value = Math.min(allOnlineMessages.value.length, visibleMessageLimit.value + messageLoadStep);
  await nextTick();
  messageList.scrollTop = messageList.scrollHeight - previousScrollHeight + previousScrollTop;
  loadingEarlierMessages.value = false;
}

function handleMessageListScroll() {
  if ((messageListRef.value?.scrollTop ?? 0) > topLoadThreshold) return;
  void loadEarlierMessages();
}

onMounted(async () => {
  await store.hydrate();
  await syncConversationState(props.id);
  resetMessageWindow();
  const focusId = focusedMessageId();
  if (focusId) {
    await scrollToOnlineMessage(focusId);
  } else {
    await scrollMessagesToBottom();
  }
  void store.maybeRequestProactiveReply(props.id);
  proactiveReplyTimer = window.setInterval(() => {
    void store.maybeRequestProactiveReply(props.id);
  }, 60_000);
});

watch(() => props.id, (id) => {
  void (async () => {
    composerText.value = readComposerDraft(id);
    resetMessageWindow();
    await syncConversationState(id);
    const focusId = focusedMessageId();
    if (focusId) {
      await scrollToOnlineMessage(focusId);
    } else {
      await scrollMessagesToBottom();
    }
    void store.maybeRequestProactiveReply(id);
  })();
});

watch(() => route.query.focus, (value) => {
  const focusId = Array.isArray(value) ? value[0] ?? '' : typeof value === 'string' ? value : '';
  if (focusId) void scrollToOnlineMessage(focusId);
}, { flush: 'post' });

watch(() => [allOnlineMessages.value.length, currentConversationReplying.value], () => {
  if (focusedMessageId()) return;
  void scrollMessagesToBottom();
}, {
  flush: 'post'
});

watch(() => composerStickerSuggestions.value.length, () => {
  if (composerFocused.value || isMessageListNearBottom()) queueMessagesToBottomAfterLayout();
});

watch(showStickers, (open) => {
  if (!open) {
    stickerPanelHeight.value = 0;
    if (isMessageListNearBottom()) queueMessagesToBottomAfterLayout();
  }
});

watch(showVoicePanel, (open) => {
  if (!open) resetVoicePanel();
});

async function sendBubble(content: string) {
  releaseKeyboardScrollGuard();
  await store.appendUserMessage(props.id, content, quoteTarget.value);
  quoteTarget.value = null;
  writeComposerDraft(props.id, '');
}

async function sendAndReply(content: string) {
  releaseKeyboardScrollGuard();
  if (content.trim()) {
    await store.appendUserMessage(props.id, content, quoteTarget.value);
    quoteTarget.value = null;
    writeComposerDraft(props.id, '');
  }
  await store.requestRoleplayReply(props.id);
}

async function sendStickerSuggestion(sticker: Sticker) {
  releaseKeyboardScrollGuard();
  await store.sendStickerMessage(props.id, sticker, quoteTarget.value);
  quoteTarget.value = null;
}

function openImagePanel() {
  imageSendTab.value = 'local';
  showImagePanel.value = true;
}

async function appendImageMessage(image: ChatImageAttachment, content: string) {
  releaseKeyboardScrollGuard();
  const userMessage = await store.appendUserImageMessage(props.id, content, image, quoteTarget.value);
  if (!userMessage) return;
  quoteTarget.value = null;
}

async function sendImageFile(file: File, kind: 'photo' | 'local') {
  if (sendingImage.value || currentConversationReplying.value) return;
  sendingImage.value = true;
  try {
    const image = await readChatImageFile(file);
    const isPhoto = kind === 'photo';
    const description = isPhoto ? '相机照片' : '本地图片';
    await appendImageMessage({
      kind,
      description,
      aiHint: kind === 'local' ? localImageHintDraft.value.trim() || undefined : undefined,
      url: image.dataUrl,
      fileName: file.name,
      mimeType: image.mimeType,
      width: image.width,
      height: image.height
    }, '[图片]');
    if (kind === 'local') localImageHintDraft.value = '';
    showImagePanel.value = false;
  } catch (error) {
    store.showConfigAlert(error instanceof Error ? error.message : '图片读取失败。', '无法发送图片');
  } finally {
    sendingImage.value = false;
  }
}

async function sendCapturedPhoto(file: File) {
  await sendImageFile(file, 'photo');
}

async function sendLocalImageFromInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file?.type.startsWith('image/')) return;
  await sendImageFile(file, 'local');
}

async function sendDescriptionImage() {
  const description = imageDescriptionDraft.value.trim();
  if (!description || sendingImage.value || currentConversationReplying.value) return;
  sendingImage.value = true;
  try {
    await appendImageMessage({
      kind: 'description',
      description
    }, `[图片描述卡片] ${description}`);
    imageDescriptionDraft.value = '';
    showImagePanel.value = false;
  } finally {
    sendingImage.value = false;
  }
}

function estimateVoiceDuration(content: string) {
  const textLength = content.trim().length;
  return Math.max(1, Math.min(60, Math.ceil(textLength / 4)));
}

function formatVoiceDuration(seconds: number) {
  if (!seconds) return '0"';
  return `${Math.max(1, Math.round(seconds))}"`;
}

function openVoicePanel() {
  voiceSendTab.value = 'record';
  showVoicePanel.value = true;
}

function openLocationPanel() {
  if (chatActionLocked.value) return;
  showActionMenu.value = false;
  locationNameDraft.value = '';
  locationAddressDraft.value = '';
  locationDistanceDraft.value = '';
  showLocationPanel.value = true;
}

function openTransferPanel() {
  if (chatActionLocked.value) return;
  showActionMenu.value = false;
  transferAmountDraft.value = '';
  transferNoteDraft.value = '';
  showTransferPanel.value = true;
}

function openMusicListenInvitePanel() {
  if (chatActionLocked.value) return;
  showActionMenu.value = false;
  musicListenNoteDraft.value = '';
  showMusicListenPanel.value = true;
}

async function goToMusicPage() {
  await router.push({ name: 'music' });
}

function confirmStopListenTogether() {
  if (character.value) musicPlayer.stopListenTogether(character.value.id);
  showStopListenConfirm.value = false;
}

function openNarrationPanel() {
  if (chatActionLocked.value) return;
  showActionMenu.value = false;
  narrationDraft.value = '';
  showNarrationPanel.value = true;
}

async function sendTransferMessage() {
  if (!canSendTransfer.value || chatActionLocked.value) return;
  releaseKeyboardScrollGuard();
  const userMessage = await store.appendUserTransferMessage(props.id, {
    amount: normalizedTransferAmount.value,
    note: transferNoteDraft.value.trim() || undefined
  }, quoteTarget.value);
  if (!userMessage) return;
  quoteTarget.value = null;
  showTransferPanel.value = false;
  await scrollMessagesToBottom();
}

async function respondToTransfer(messageId: string, status: Exclude<ChatTransferStatus, 'pending'>) {
  return store.updateTransferStatus(messageId, status, 'user');
}

async function sendMusicListenInviteMessage() {
  if (chatActionLocked.value) return;
  releaseKeyboardScrollGuard();
  const userMessage = await store.appendUserMusicListenInviteMessage(props.id, {
    note: musicListenNoteDraft.value.trim() || undefined,
    track: musicInviteTrack.value ?? undefined
  }, quoteTarget.value);
  if (!userMessage) return;
  quoteTarget.value = null;
  showMusicListenPanel.value = false;
  await scrollMessagesToBottom();
}

async function acceptMusicListenInvite(message: ChatMessage) {
  if (!message.musicListenInvite || message.musicListenInvite.status !== 'pending') return;
  await store.acceptMusicListenInvite(message.id);
}

async function rejectMusicListenInvite(message: ChatMessage) {
  if (!message.musicListenInvite || message.musicListenInvite.status !== 'pending') return;
  await store.rejectMusicListenInvite(message.id);
}

async function rejectOfflineInvitation(message: ChatMessage) {
  if (!message.offlineInvitation || message.offlineInvitation.status !== 'pending') return;
  await store.rejectOfflineInvitation(message.id);
}

async function acceptOfflineInvitation(message: ChatMessage) {
  if (!message.offlineInvitation || message.offlineInvitation.status !== 'pending') return;
  const accepted = await store.acceptOfflineInvitation(message.id);
  if (!accepted) return;
  await router.replace({ name: 'offline-room', params: { id: props.id } });
}

async function appendLocationMessage(location: ChatLocationAttachment) {
  releaseKeyboardScrollGuard();
  const userMessage = await store.appendUserLocationMessage(props.id, location, quoteTarget.value);
  if (!userMessage) return;
  quoteTarget.value = null;
  await scrollMessagesToBottom();
}

async function sendLocationMessage() {
  const name = locationNameDraft.value.trim();
  const distance = locationDistanceDraft.value.trim();
  if (!name || !distance || chatActionLocked.value) return;
  await appendLocationMessage({
    name,
    address: locationAddressDraft.value.trim() || undefined,
    distance
  });
  showLocationPanel.value = false;
}

async function sendNarrationMessage() {
  const content = narrationDraft.value.trim();
  if (!content || chatActionLocked.value) return;
  releaseKeyboardScrollGuard();
  const message = await store.appendConversationEvent(props.id, content, { mode: 'online' });
  if (!message) return;
  narrationDraft.value = '';
  showNarrationPanel.value = false;
  await scrollMessagesToBottom();
}

function getPreferredAudioMimeType() {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return '';
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
    .find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? '';
}

function getVoiceRecognitionConstructor() {
  if (typeof window === 'undefined') return undefined;
  const speechWindow = window as SpeechRecognitionWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

function getVoiceRecognitionLanguage() {
  if (typeof navigator === 'undefined') return 'zh-CN';
  const language = navigator.language || 'zh-CN';
  return language.toLowerCase().startsWith('zh') ? language : 'zh-CN';
}

function getVoiceRecognitionErrorText(error?: string) {
  if (error === 'not-allowed' || error === 'service-not-allowed') return '未允许转文字';
  if (error === 'audio-capture') return '无法转文字';
  if (error === 'network') return '转文字网络异常';
  if (error === 'language-not-supported') return '语言不支持';
  if (error === 'no-speech') return '等待说话';
  return '转文字暂停';
}

function isFatalVoiceRecognitionError(error?: string) {
  return ['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported'].includes(error ?? '');
}

function joinVoiceRecognitionParts(parts: string[]) {
  return parts.map((part) => part.trim()).filter(Boolean).join(' ');
}

function syncVoiceRecognitionDraft(interimText = '') {
  const recognizedText = joinVoiceRecognitionParts([voiceRecognitionFinalText, interimText]);
  if (!recognizedText) return;
  const nextText = voiceRecognitionStartText
    ? `${voiceRecognitionStartText}\n${recognizedText}`
    : recognizedText;
  voiceTranscriptDraft.value = nextText.slice(0, voiceTranscriptLimit);
}

function stopVoiceTranscription(abort = false) {
  if (abort) voiceRecognitionRunId += 1;
  voiceRecognitionStopping = true;
  recognizingVoice.value = false;
  const recognition = voiceRecognition;
  voiceRecognition = null;
  if (!recognition) return;
  try {
    if (abort) recognition.abort();
    else recognition.stop();
  } catch {}
}

function startVoiceTranscription() {
  stopVoiceTranscription(true);
  voiceRecognitionRunId += 1;
  const runId = voiceRecognitionRunId;
  voiceRecognitionStopping = false;
  recognizingVoice.value = false;
  voiceRecognitionNotice.value = '';
  voiceRecognitionFinalText = '';

  const SpeechRecognition = getVoiceRecognitionConstructor();
  if (!SpeechRecognition) {
    voiceRecognitionNotice.value = '转文字不可用';
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = getVoiceRecognitionLanguage();
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => {
    if (runId !== voiceRecognitionRunId) return;
    let interimText = '';
    for (let resultIndex = event.resultIndex; resultIndex < event.results.length; resultIndex += 1) {
      const result = event.results[resultIndex];
      const transcript = result?.[0]?.transcript.trim() ?? '';
      if (!transcript) continue;
      if (result?.isFinal) {
        voiceRecognitionFinalText = joinVoiceRecognitionParts([voiceRecognitionFinalText, transcript]);
      } else {
        interimText = joinVoiceRecognitionParts([interimText, transcript]);
      }
    }
    syncVoiceRecognitionDraft(interimText);
  };
  recognition.onerror = (event) => {
    if (runId !== voiceRecognitionRunId || voiceRecognitionStopping) return;
    voiceRecognitionNotice.value = getVoiceRecognitionErrorText(event.error);
    if (isFatalVoiceRecognitionError(event.error)) voiceRecognitionStopping = true;
  };
  recognition.onend = () => {
    if (runId !== voiceRecognitionRunId) return;
    recognizingVoice.value = false;
    if (!voiceRecognitionStopping && recordingVoice.value && voiceRecognition === recognition) {
      window.setTimeout(() => {
        if (runId !== voiceRecognitionRunId || voiceRecognitionStopping || !recordingVoice.value || voiceRecognition !== recognition) return;
        try {
          recognition.start();
          recognizingVoice.value = true;
          voiceRecognitionNotice.value = '';
        } catch {
          voiceRecognitionNotice.value = '转文字暂停';
        }
      }, 160);
      return;
    }
    if (voiceRecognition === recognition) voiceRecognition = null;
  };
  voiceRecognition = recognition;

  try {
    recognition.start();
    recognizingVoice.value = true;
  } catch {
    voiceRecognition = null;
    voiceRecognitionNotice.value = '转文字启动失败';
  }
}

function resetVoiceTranscription() {
  stopVoiceTranscription(true);
  voiceRecognitionNotice.value = '';
  voiceRecognitionStartText = '';
  voiceRecognitionFinalText = '';
  voiceRecognitionStopping = false;
}

function cleanupVoiceRecorder() {
  if (voiceTimer !== undefined) {
    window.clearInterval(voiceTimer);
    voiceTimer = undefined;
  }
  voiceStream?.getTracks().forEach((track) => track.stop());
  voiceStream = null;
  voiceRecorder = null;
  voiceChunks = [];
  recordingVoice.value = false;
  recordingStartedAt.value = 0;
  recordingElapsed.value = 0;
}

function abortVoiceRecording() {
  discardRecording = true;
  stopVoiceTranscription(true);
  if (voiceRecorder) {
    if (voiceRecorder.state !== 'inactive') voiceRecorder.stop();
    return;
  }
  cleanupVoiceRecorder();
  discardRecording = false;
}

function resetVoicePanel() {
  abortVoiceRecording();
  resetVoiceTranscription();
  voiceSendTab.value = 'record';
  voiceTranscriptDraft.value = '';
  voiceTextDraft.value = '';
  recordedVoiceDraft.value = null;
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('语音读取失败。'));
    reader.readAsDataURL(blob);
  });
}

async function finalizeVoiceRecording(recorder: MediaRecorder) {
  const shouldDiscard = discardRecording;
  discardRecording = false;
  stopVoiceTranscription(shouldDiscard);
  const chunks = [...voiceChunks];
  const duration = Math.max(1, Math.round((Date.now() - recordingStartedAt.value) / 1000) || Math.round(recordingElapsed.value));
  const mimeType = recorder.mimeType || chunks[0]?.type || 'audio/webm';
  cleanupVoiceRecorder();
  if (shouldDiscard) return;
  if (!chunks.length) {
    store.showConfigAlert('没有录到可发送的语音。', '录音为空');
    return;
  }

  try {
    const blob = new Blob(chunks, { type: mimeType });
    recordedVoiceDraft.value = {
      audioUrl: await blobToDataUrl(blob),
      duration,
      mimeType: blob.type || mimeType
    };
  } catch (error) {
    store.showConfigAlert(error instanceof Error ? error.message : '语音读取失败。', '无法读取语音');
  }
}

async function startVoiceRecording() {
  if (recordingVoice.value || currentConversationReplying.value) return;
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    showVoicePanel.value = false;
    store.showConfigAlert('当前浏览器不支持录音。', '无法录音');
    return;
  }

  try {
    const replacingRecordedDraft = Boolean(recordedVoiceDraft.value);
    recordedVoiceDraft.value = null;
    if (replacingRecordedDraft) voiceTranscriptDraft.value = '';
    recordingElapsed.value = 0;
    voiceRecognitionStartText = voiceTranscriptDraft.value.trim();
    voiceRecognitionFinalText = '';
    voiceRecognitionNotice.value = '';
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const preferredMimeType = getPreferredAudioMimeType();
    const recorder = preferredMimeType
      ? new MediaRecorder(stream, { mimeType: preferredMimeType })
      : new MediaRecorder(stream);
    voiceStream = stream;
    voiceRecorder = recorder;
    voiceChunks = [];
    discardRecording = false;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) voiceChunks.push(event.data);
    };
    recorder.onstop = () => {
      void finalizeVoiceRecording(recorder);
    };
    recordingStartedAt.value = Date.now();
    recordingVoice.value = true;
    voiceTimer = window.setInterval(() => {
      recordingElapsed.value = (Date.now() - recordingStartedAt.value) / 1000;
    }, 200);
    recorder.start();
    startVoiceTranscription();
  } catch (error) {
    stopVoiceTranscription(true);
    cleanupVoiceRecorder();
    showVoicePanel.value = false;
    store.showConfigAlert(error instanceof Error ? error.message : '请允许浏览器访问麦克风。', '无法录音');
  }
}

function stopVoiceRecording() {
  if (!voiceRecorder || voiceRecorder.state === 'inactive') return;
  stopVoiceTranscription();
  recordingElapsed.value = (Date.now() - recordingStartedAt.value) / 1000;
  voiceRecorder.stop();
}

async function appendVoiceMessage(voice: ChatVoiceAttachment) {
  releaseKeyboardScrollGuard();
  const userMessage = await store.appendUserVoiceMessage(props.id, voice, quoteTarget.value);
  if (!userMessage) return;
  quoteTarget.value = null;
  await scrollMessagesToBottom();
}

async function sendRecordedVoice() {
  const draft = recordedVoiceDraft.value;
  const transcript = voiceTranscriptDraft.value.trim();
  if (!draft?.audioUrl || !transcript || recordingVoice.value || currentConversationReplying.value) return;
  await appendVoiceMessage({
    source: 'recorded',
    transcript,
    duration: draft.duration,
    audioUrl: draft.audioUrl,
    mimeType: draft.mimeType
  });
  showVoicePanel.value = false;
}

async function sendTextVoice() {
  const transcript = voiceTextDraft.value.trim();
  if (!transcript || currentConversationReplying.value) return;
  await appendVoiceMessage({
    source: 'text',
    transcript,
    duration: estimateVoiceDuration(transcript)
  });
  showVoicePanel.value = false;
}

async function regenerateChatImage(messageId: string, description: string) {
  if (regeneratingChatImageMessageIds.value.includes(messageId)) {
    store.showConfigAlert('正在重新生成聊天图片，请等待当前生成完成。', '正在生成');
    return;
  }
  regeneratingChatImageMessageIds.value = [...regeneratingChatImageMessageIds.value, messageId];
  try {
    await store.regenerateChatMessageImage(messageId, description);
  } finally {
    regeneratingChatImageMessageIds.value = regeneratingChatImageMessageIds.value.filter((id) => id !== messageId);
  }
}

async function applyChatImageCandidate(messageId: string, candidateId: string) {
  await store.applyChatMessageImageCandidate(messageId, candidateId);
}

function messageIdsForAction(message: ChatMessage) {
  return message.id.split('__').map((id) => id.trim()).filter(Boolean);
}

function messageActionText(message: ChatMessage) {
  if (message.sticker) return `[Sticker] ${message.sticker.description}`;
  if (message.image) return `[图片] ${message.image.description}`;
  if (message.voice) return `[语音] ${message.voice.transcript}`;
  if (message.location) return `[定位] ${[message.location.name, message.location.address, message.location.distance].filter(Boolean).join(' · ')}`;
  if (message.transfer) return `${message.transfer.responseToMessageId ? '[转账回执]' : '[转账]'} ¥${message.transfer.amount} · ${message.transfer.status === 'pending' ? '待处理' : message.transfer.status === 'accepted' ? '已接收' : '已拒绝'}`;
  if (message.theaterLink) return `[网站链接] ${message.theaterLink.title} · ${message.theaterLink.summary} · ${message.theaterLink.url}`;
  return message.content;
}

function canQuoteMessage(message: ChatMessage) {
  return message.sender === 'char' && !message.id.includes('__') && Boolean(store.createMessageQuoteSnapshot(message));
}

function quoteMessage(message: ChatMessage) {
  if (!canQuoteMessage(message)) return;
  const quote = store.createMessageQuoteSnapshot(message);
  if (!quote) return;
  quoteTarget.value = quote;
  focusComposerInput();
}

function createLinkMapLabel(address: string, fallback: string) {
  const match = address.match(/([^市区县]+(?:街|路|巷|道)\d*[^\s,，。]*)/);
  return match?.[1] || fallback || '目前位置';
}

function openCardDetail(message: ChatMessage) {
  if (message.theaterLink?.theaterId) {
    void router.push({ name: 'small-theater-detail', params: { theaterId: message.theaterLink.theaterId } });
  }
}

function editableMessageText(message: ChatMessage) {
  if (message.voice) return message.voice.transcript;
  if (message.location) return message.location.name;
  if (message.transfer) return message.transfer.amount;
  return message.sticker?.description ?? message.image?.description ?? message.content;
}

function isMessageSelected(message: ChatMessage) {
  const selectedIds = new Set(selectedMessageIds.value);
  const ids = messageIdsForAction(message);
  return ids.length > 0 && ids.every((id) => selectedIds.has(id));
}

function toggleMessageSelection(message: ChatMessage) {
  const ids = messageIdsForAction(message);
  const selectedIds = new Set(selectedMessageIds.value);
  const allSelected = ids.every((id) => selectedIds.has(id));
  for (const id of ids) {
    if (allSelected) selectedIds.delete(id);
    else selectedIds.add(id);
  }
  selectedMessageIds.value = [...selectedIds];
}

function openMessageActions(message: ChatMessage) {
  activeMessage.value = message;
  showMessageMenu.value = true;
}

function cancelSelection() {
  selectionMode.value = false;
  selectedMessageIds.value = [];
}

function clearQuoteIfMessagesRemoved(messageIds: string[]) {
  if (quoteTarget.value && messageIds.includes(quoteTarget.value.messageId)) quoteTarget.value = null;
}

async function copyActiveMessage() {
  const message = activeMessage.value;
  if (!message) return;
  try {
    await navigator.clipboard.writeText(messageActionText(message));
    store.showConfigAlert('已复制消息内容。', '已复制');
  } catch {
    store.showConfigAlert('当前浏览器不允许写入剪贴板。', '复制失败');
  } finally {
    showMessageMenu.value = false;
  }
}

async function deleteActiveMessage() {
  const message = activeMessage.value;
  if (!message) return;
  pendingDeleteIds.value = messageIdsForAction(message);
  pendingDeleteFromSelection.value = false;
  showMessageMenu.value = false;
  showDeleteConfirm.value = true;
}

function startSelectionFromActive() {
  const message = activeMessage.value;
  if (message) selectedMessageIds.value = messageIdsForAction(message);
  selectionMode.value = true;
  showMessageMenu.value = false;
}

async function favoriteActiveMessage() {
  const message = activeMessage.value;
  if (!message || !canFavoriteActiveMessage.value || isActiveMessageFavorited.value) return;
  const favorite = await store.addFavoriteMessage(message);
  if (!favorite) return;
  showMessageMenu.value = false;
  store.showConfigAlert('已加入收藏。', '收藏成功');
}

async function deleteSelectedMessages() {
  const ids = [...selectedMessageIds.value];
  if (!ids.length) return;
  pendingDeleteIds.value = ids;
  pendingDeleteFromSelection.value = true;
  showDeleteConfirm.value = true;
}

function cancelDeleteConfirm() {
  pendingDeleteIds.value = [];
  pendingDeleteFromSelection.value = false;
  showDeleteConfirm.value = false;
}

async function confirmDeleteMessages() {
  const ids = [...pendingDeleteIds.value];
  if (!ids.length) {
    cancelDeleteConfirm();
    return;
  }
  await store.deleteMessages(ids);
  clearQuoteIfMessagesRemoved(ids);
  if (pendingDeleteFromSelection.value) cancelSelection();
  cancelDeleteConfirm();
}

async function recallActiveMessage() {
  const message = activeMessage.value;
  if (!message || !canRecallActiveMessage.value) return;
  await store.recallMessage(message.id, { actor: 'user' });
  clearQuoteIfMessagesRemoved([message.id]);
  showMessageMenu.value = false;
}

function quoteActiveMessage() {
  const message = activeMessage.value;
  if (!message || !canQuoteActiveMessage.value) return;
  showMessageMenu.value = false;
  quoteMessage(message);
}

async function regenerateActiveVoice() {
  const message = activeMessage.value;
  if (!message || !canRegenerateActiveVoice.value || regeneratingVoiceMessageIds.value.includes(message.id)) return;
  regeneratingVoiceMessageIds.value = [...regeneratingVoiceMessageIds.value, message.id];
  try {
    await store.generateMessageVoiceAudio(message.id, { force: true });
    showMessageMenu.value = false;
    store.showConfigAlert('已按当前 TTS 配置重新生成这条语音。', '语音已更新');
  } catch (error) {
    store.showConfigAlert(error instanceof Error ? error.message : '语音重新生成失败，请检查 TTS 配置。', '生成失败');
  } finally {
    regeneratingVoiceMessageIds.value = regeneratingVoiceMessageIds.value.filter((id) => id !== message.id);
  }
}

function openEditActiveMessage() {
  const message = activeMessage.value;
  if (!message || !canEditActiveMessage.value) return;
  editDraft.value = editableMessageText(message);
  editLocationNameDraft.value = message.location?.name ?? '';
  editLocationAddressDraft.value = message.location?.address ?? '';
  editLocationDistanceDraft.value = message.location?.distance ?? '';
  editTransferAmountDraft.value = message.transfer?.amount ?? '';
  editTransferNoteDraft.value = message.transfer?.note ?? '';
  editTransferStatusDraft.value = message.transfer?.responseToMessageId && message.transfer.status === 'pending'
    ? 'accepted'
    : message.transfer?.status ?? 'pending';
  showMessageMenu.value = false;
  showEditModal.value = true;
}

async function saveEditedMessage() {
  const message = activeMessage.value;
  if (!message || !canSaveEditedMessage.value) return;
  if (message.location) {
    await store.updateMessageLocation(message.id, {
      name: editLocationNameDraft.value,
      address: editLocationAddressDraft.value || undefined,
      distance: editLocationDistanceDraft.value
    });
  } else if (message.transfer) {
    await store.updateMessageTransfer(message.id, {
      amount: normalizedEditTransferAmount.value,
      note: editTransferNoteDraft.value || undefined,
      status: editTransferStatusDraft.value
    });
  } else {
    await store.updateMessageContent(message.id, editDraft.value);
  }
  showEditModal.value = false;
}

function openUserProfile() {
  showActionMenu.value = false;
  showUserProfile.value = true;
}

async function openCharacterProfile() {
  showActionMenu.value = false;
  showProfile.value = true;
  if (character.value) await store.markCharacterMindStateRead(character.value.id);
}

function openModelSwitch() {
  showActionMenu.value = false;
  showModelSwitch.value = true;
}

function openDeleteFriendConfirm() {
  if (chatActionLocked.value) return;
  showActionMenu.value = false;
  showDeleteFriendConfirm.value = true;
}

function openClearHistoryConfirm() {
  if (chatActionLocked.value) return;
  showActionMenu.value = false;
  showClearHistoryConfirm.value = true;
}

async function confirmDeleteFriend() {
  const currentCharacter = character.value;
  if (!currentCharacter || deletingFriend.value || chatActionLocked.value) return;
  deletingFriend.value = true;
  try {
    await store.deleteCharacterProfile(currentCharacter.id);
    showDeleteFriendConfirm.value = false;
    store.showConfigAlert('已删除好友。', '删除完成');
    await router.replace({ name: 'chats' });
  } finally {
    deletingFriend.value = false;
  }
}

async function confirmClearHistory() {
  const currentCharacter = character.value;
  if (!currentCharacter || clearingHistory.value || chatActionLocked.value) return;
  clearingHistory.value = true;
  try {
    const cleared = await store.clearCharacterHistory(currentCharacter.id);
    showClearHistoryConfirm.value = false;
    if (cleared) {
      quoteTarget.value = null;
      cancelSelection();
      store.showConfigAlert('已清空该角色记忆，好友状态已回到初始。', '清空完成');
      await store.updateConversationMode(props.id, 'online');
      await router.replace({ name: 'chat-room', params: { id: props.id } });
      await scrollMessagesToBottom();
    }
  } finally {
    clearingHistory.value = false;
  }
}

function openChatSettings() {
  void router.push({ name: 'chat-settings', params: { id: props.id } });
}

function openSmallTheater() {
  showActionMenu.value = false;
  void router.push({ name: 'small-theater', params: { id: props.id } });
}

function openProfileThemes() {
  showActionMenu.value = false;
  void router.push({ name: 'profile-themes', params: { id: props.id } });
}

function openChatSearch() {
  void router.push({ name: 'chat-search', params: { id: props.id } });
}

function regenerateReply() {
  if (currentConversationReplying.value) {
    store.showConfigAlert('正在生成回复，请等待当前生成完成。', '正在生成');
    return;
  }
  showActionMenu.value = false;
  regeneratePromptDraft.value = '';
  showRegeneratePrompt.value = true;
}

function regenerateReplyInstruction() {
  const instruction = regeneratePromptDraft.value.trim();
  if (!instruction) return undefined;
  return `本次是用户点击“重新回复”要求重新生成上一条线上回复。请优先遵守以下额外引导，同时继续遵守角色设定、聊天规则和边界：${instruction}`;
}

async function confirmRegenerateReply() {
  if (currentConversationReplying.value) return;
  const replyInstruction = regenerateReplyInstruction();
  showRegeneratePrompt.value = false;
  await store.regenerateLatestReply(props.id, { replyInstruction });
}

function openGobangPlaceholder() {
  showActionMenu.value = false;
  store.showConfigAlert('五子棋功能开发中。', '五子棋');
}

async function generateVoomPost() {
  if (generatingVoom.value) {
    store.showConfigAlert('正在生成 VOOM，请等待当前生成完成。', '正在生成');
    return;
  }
  showActionMenu.value = false;
  generatingVoom.value = true;
  try {
    await store.createMomentFromConversation(props.id);
  } catch (error) {
    store.showConfigAlert(error instanceof Error ? error.message : 'VOOM 生成失败。', '无法生成 VOOM');
  } finally {
    generatingVoom.value = false;
  }
}

async function saveUserProfile(user: UserProfile) {
  if (!character.value || !boundUser.value) {
    await store.saveUserProfile(user);
    return;
  }

  const normalizedUser = normalizeUserProfile({
    ...boundUser.value,
    nickname: user.nickname,
    signature: user.signature
  });

  await store.saveUserProfile(normalizedUser);

  await store.saveCharacter({
    ...character.value,
    boundUserProfile: normalizeVisualProfile({
      ...user.profile,
      nickname: normalizedUser.nickname,
      bio: normalizedUser.signature
    }, {
      ...normalizedUser,
      avatar: user.avatar || normalizedUser.avatar
    })
  });
}

async function saveCharacterProfile(nextCharacter: CharacterProfile) {
  await store.saveCharacter(nextCharacter);
}

async function deleteCharacterProfileHistoryEntry(entryId: string) {
  const currentCharacter = character.value;
  if (!currentCharacter) return;
  await store.deleteCharacterProfileHistoryEntry(currentCharacter.id, entryId);
}

async function clearCharacterProfileHistory() {
  const currentCharacter = character.value;
  if (!currentCharacter) return;
  await store.clearCharacterProfileHistory(currentCharacter.id);
}

async function enterOffline() {
  if (chatActionLocked.value) return;
  await store.updateConversationMode(props.id, 'offline');
  await router.replace({ name: 'offline-room', params: { id: props.id } });
}

onBeforeUnmount(() => {
  writeComposerDraft(props.id, composerText.value);
  abortVoiceRecording();
  clearQueuedBottomRestores();
  if (proactiveReplyTimer !== undefined) window.clearInterval(proactiveReplyTimer);
});
</script>

<style scoped>
.chat-room {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding-bottom: 0;
  background-position: center;
  background-size: cover;
}

.chat-room :deep(.chat-header),
.chat-room :deep(.composer) {
  background: transparent;
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}

.message-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 8px 10px calc(8px + var(--keyboard-inset) + var(--sticker-panel-offset, 0px));
  -webkit-overflow-scrolling: touch;
  overflow-anchor: none;
  scroll-padding-bottom: calc(8px + var(--keyboard-inset) + var(--sticker-panel-offset, 0px));
}

.listen-status-strip {
  display: grid;
  grid-template-columns: 24px minmax(0, auto) minmax(0, 1fr) 22px;
  align-items: center;
  gap: 4px;
  min-height: 34px;
  margin: 0 10px 4px;
  padding: 5px 6px 5px 9px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.86);
  color: #202329;
  box-shadow: 0 8px 22px rgba(17, 20, 24, 0.08);
  -webkit-backdrop-filter: blur(16px);
  backdrop-filter: blur(16px);
}

.listen-status-strip img {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
}

.listen-status-strip span,
.listen-status-strip strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.listen-status-track,
.listen-status-close {
  display: grid;
  min-width: 0;
  border: 0;
  background: transparent;
  color: inherit;
  padding: 0;
}

.listen-status-track {
  width: 100%;
  overflow: hidden;
  justify-items: start;
  cursor: pointer;
}

.listen-status-close {
  place-items: center;
  justify-self: end;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  color: rgba(89, 96, 106, 0.76);
}

.listen-status-close:active {
  background: rgba(226, 59, 88, 0.08);
  color: #e23b58;
}

.listen-status-strip span {
  max-width: 112px;
  color: #e23b58;
  font-size: 11px;
  font-weight: 860;
}

.listen-status-strip strong {
  display: block;
  width: 100%;
  color: #59606a;
  font-size: 11px;
  font-weight: 760;
}

.chat-room :deep(.composer) {
  transform: translate3d(0, calc(0px - var(--keyboard-inset) - var(--sticker-panel-offset, 0px)), 0);
}

.message-list :deep(.message-focus-pulse .bubble) {
  animation: message-focus-pulse 1.2s ease-out;
}

@keyframes message-focus-pulse {
  0%, 100% {
    box-shadow: none;
  }
  35% {
    box-shadow: 0 0 0 4px rgba(104, 113, 122, 0.18);
  }
}

.history-loader {
  margin: 3px auto 9px;
  width: fit-content;
  max-width: 100%;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(245, 246, 248, 0.92);
  color: #7b828a;
  font-size: 12px;
  line-height: 1.2;
}

.hidden-file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.image-send-panel {
  display: grid;
  gap: 12px;
  width: 100%;
  min-width: 0;
  container-type: inline-size;
}

.listen-invite-send-panel {
  display: grid;
  gap: 12px;
}

.listen-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.listen-panel-head p,
.listen-panel-head h3 {
  margin: 0;
}

.listen-panel-head p {
  color: #e23b58;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.listen-panel-head h3 {
  color: #202329;
  font-size: 18px;
  line-height: 1.2;
}

.listen-compose-preview {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  min-height: 86px;
  overflow: hidden;
  border-radius: 14px;
  background:
    radial-gradient(circle at 38px 43px, rgba(226, 59, 88, 0.13), transparent 54px),
    linear-gradient(135deg, #ffffff 0%, #fff8fa 58%, #f7fbf9 100%);
  padding: 14px;
  box-shadow: inset 0 0 0 1px rgba(226, 59, 88, 0.12), 0 10px 24px rgba(226, 59, 88, 0.06);
}

.listen-preview-disc {
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  overflow: hidden;
  border-radius: 50%;
  background:
    radial-gradient(circle at center, #ffffff 0 14px, transparent 15px),
    repeating-radial-gradient(circle, rgba(226, 59, 88, 0.10) 0 1px, rgba(255, 255, 255, 0.82) 2px 6px),
    linear-gradient(135deg, #fff3f6, #edf9f3);
  box-shadow: inset 0 0 0 1px rgba(226, 59, 88, 0.16), 0 10px 20px rgba(226, 59, 88, 0.10);
}

.listen-preview-disc img {
  width: 72%;
  height: 72%;
  border-radius: 50%;
  object-fit: cover;
  box-shadow: 0 3px 10px rgba(17, 20, 24, 0.10);
}

.listen-preview-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.listen-preview-copy small,
.listen-preview-copy span {
  overflow: hidden;
  color: #737983;
  font-size: 12px;
  font-weight: 760;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.listen-preview-copy strong {
  overflow: hidden;
  color: #202329;
  font-size: 18px;
  font-weight: 930;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.listen-field {
  display: grid;
  gap: 7px;
}

.listen-field span {
  color: #69717b;
  font-size: 12px;
  font-weight: 820;
}

.listen-field input {
  width: 100%;
  min-height: 44px;
  border: 0;
  border-radius: 12px;
  background: #f4f5f7;
  color: #202329;
  padding: 0 13px;
  outline: none;
}

.listen-actions-sheet {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.listen-stop-confirm {
  display: grid;
  gap: 10px;
}

.listen-stop-confirm > span {
  color: #e23b58;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.listen-stop-confirm h3,
.listen-stop-confirm p {
  margin: 0;
}

.listen-stop-confirm h3 {
  color: #202329;
  font-size: 18px;
  line-height: 1.2;
}

.listen-stop-confirm p {
  color: #69717b;
  font-size: 12px;
  line-height: 1.55;
}

.listen-stop-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 4px;
}

.image-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.image-panel-head > div {
  min-width: 0;
}

.image-panel-head p {
  margin: 0 0 3px;
  color: #8a6672;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.image-panel-head h3 {
  margin: 0;
  color: #211f24;
  font-size: 16px;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.image-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 3px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.74);
}

.image-tabs button {
  min-width: 0;
  min-height: 34px;
  padding: 6px 8px;
  border-radius: 8px;
  color: #59606a;
  font-size: 12px;
  font-weight: 900;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.image-tabs button.active {
  background: #ffffff;
  color: #171717;
  box-shadow: 0 1px 8px rgba(37, 31, 37, 0.08);
}

.local-image-tab,
.description-image-tab {
  display: grid;
  gap: 10px;
  min-width: 0;
  max-width: 100%;
}

.local-image-button {
  display: grid;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 46px;
  padding: 8px 12px;
  border-radius: 10px;
  background: #eff1f3;
  color: #2d333a;
  font-size: 13px;
  font-weight: 900;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.local-image-tab p {
  margin: 0;
  color: #737983;
  font-size: 12px;
  line-height: 1.45;
}

.description-preview {
  display: grid;
  place-items: center;
  width: min(100%, 220px);
  min-width: 0;
  margin: 0 auto;
  aspect-ratio: 1 / 1;
  padding: 20px;
  overflow: hidden;
  border: 1px solid #edf0f2;
  border-radius: 18px;
  background: #ffffff;
  color: #222222;
  box-shadow: 0 8px 26px rgba(37, 31, 37, 0.08);
}

.description-preview figcaption {
  max-width: 100%;
  max-height: 100%;
  overflow: auto;
  margin: 0;
  font-size: 13px;
  font-weight: 820;
  line-height: 1.65;
  text-align: center;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  -webkit-overflow-scrolling: touch;
}

.description-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.description-field span {
  color: #686b70;
  font-size: 12px;
  font-weight: 900;
}

.description-field textarea {
  display: block;
  width: 100%;
  min-width: 0;
  min-height: 112px;
  max-height: min(34dvh, 180px);
  resize: none;
  overflow: auto;
  border: 1px solid #edf0f2;
  border-radius: 10px;
  padding: 10px;
  background: #ffffff;
  color: #171717;
  font: inherit;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  -webkit-overflow-scrolling: touch;
}

.local-image-hint-field textarea {
  min-height: 78px;
}

.description-send-button {
  min-width: 0;
  min-height: 42px;
  padding: 9px 12px;
  border-radius: 10px;
  background: #eff1f3;
  color: #2d333a;
  font-size: 13px;
  font-weight: 900;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.voice-send-panel {
  display: grid;
  gap: 12px;
  width: 100%;
  min-width: 0;
  container-type: inline-size;
}

.location-send-panel {
  display: grid;
  gap: 12px;
  width: 100%;
  min-width: 0;
}

.transfer-send-panel,
.narration-send-panel {
  display: grid;
  gap: 12px;
  width: 100%;
  min-width: 0;
}

.transfer-panel-head,
.narration-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.transfer-panel-head > div,
.narration-panel-head > div {
  min-width: 0;
}

.transfer-panel-head p,
.narration-panel-head p {
  margin: 0 0 3px;
  color: #60646b;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.transfer-panel-head h3,
.narration-panel-head h3 {
  margin: 0;
  color: #211f24;
  font-size: 16px;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.link-location-card {
  display: grid;
  grid-template-rows: 70px auto 23px;
  min-width: 0;
  overflow: hidden;
  border: 1px solid rgba(17, 17, 17, 0.08);
  border-radius: 10px;
  background: #ffffff;
  color: #111111;
}

.link-location-map {
  position: relative;
  min-width: 0;
  min-height: 70px;
  overflow: hidden;
  background:
    linear-gradient(112deg, transparent 0 54%, rgba(216, 219, 222, 0.7) 55% 100%),
    linear-gradient(22deg, rgba(205, 231, 215, 0.72) 0 26%, transparent 27% 100%),
    linear-gradient(164deg, rgba(255, 255, 255, 0.94) 0 7%, transparent 8% 100%),
    #f0f1f3;
}

.link-location-map::after {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(180deg, transparent 54%, rgba(255, 255, 255, 0.1));
  content: '';
  pointer-events: none;
}

.link-map-road {
  position: absolute;
  display: block;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 0 0 1px rgba(222, 225, 229, 0.86);
}

.link-map-road-1 {
  left: -15px;
  top: 15px;
  width: 119px;
  height: 7px;
  transform: rotate(-27deg);
}

.link-map-road-2 {
  right: -12px;
  top: 20px;
  width: 103px;
  height: 7px;
  transform: rotate(12deg);
}

.link-map-road-3 {
  left: 40px;
  top: 39px;
  width: 106px;
  height: 7px;
  transform: rotate(-38deg);
}

.link-map-road-4 {
  left: 97px;
  top: 29px;
  width: 90px;
  height: 7px;
  transform: rotate(82deg);
}

.link-map-block {
  position: absolute;
  display: block;
  border: 1px solid rgba(222, 225, 229, 0.9);
  border-radius: 3px;
  background: rgba(246, 247, 248, 0.88);
}

.link-map-block-1 {
  left: 10px;
  top: 4px;
  width: 42px;
  height: 23px;
  transform: rotate(14deg);
}

.link-map-block-2 {
  right: 13px;
  top: 3px;
  width: 51px;
  height: 25px;
  transform: rotate(-6deg);
}

.link-map-block-3 {
  right: 5px;
  bottom: 6px;
  width: 51px;
  height: 24px;
  transform: rotate(-18deg);
}

.link-map-label {
  position: absolute;
  z-index: 2;
  max-width: 75px;
  overflow: hidden;
  color: rgba(70, 74, 82, 0.76);
  font-size: 8px;
  font-weight: 580;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.88);
}

.link-map-label-top {
  right: 21px;
  top: 8px;
}

.link-map-label-mid {
  left: 50%;
  top: 49px;
  max-width: 130px;
  padding: 1px 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.76);
  font-weight: 700;
  line-height: 1.15;
  text-align: center;
  transform: translateX(-50%);
}

.link-map-pin {
  position: absolute;
  z-index: 3;
  display: block;
  width: 16px;
  height: 16px;
  border-radius: 50% 50% 50% 0;
  background: #ef4c43;
  transform: rotate(-45deg);
  box-shadow: 0 1px 4px rgba(17, 17, 17, 0.2);
}

.link-map-pin::after {
  position: absolute;
  left: 5px;
  top: 5px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ffffff;
  content: '';
}

.link-map-pin-main {
  left: 50%;
  top: 35px;
  transform: translate(-50%, -50%) rotate(-45deg);
}

.link-map-pin-secondary {
  right: 15px;
  bottom: 10px;
  width: 14px;
  height: 14px;
  background: #5f7180;
}

.link-map-pin-secondary::after {
  left: 4px;
  top: 4px;
  width: 6px;
  height: 6px;
}

.link-map-google {
  position: absolute;
  left: 7px;
  bottom: 5px;
  z-index: 4;
  display: inline-flex;
  align-items: baseline;
  font-family: Arial, sans-serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: -1px;
  line-height: 1;
}

.link-map-google span:nth-child(1),
.link-map-google span:nth-child(4) {
  color: #4285f4;
}

.link-map-google span:nth-child(2),
.link-map-google span:nth-child(6) {
  color: #db4437;
}

.link-map-google span:nth-child(3) {
  color: #f4b400;
}

.link-map-google span:nth-child(5) {
  color: #0f9d58;
}

.link-location-body {
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 5px 7px 6px;
  border-bottom: 1px solid #eeeeee;
  background: #ffffff;
}

.link-location-kicker {
  color: #04a64b;
  font-size: 7px;
  font-weight: 900;
  letter-spacing: 0.08em;
  line-height: 1.05;
  text-transform: uppercase;
}

.link-location-body strong {
  display: -webkit-box;
  min-width: 0;
  color: #101010;
  font-size: 10px;
  font-weight: 930;
  line-height: 1.2;
  overflow: hidden;
  overflow-wrap: anywhere;
  word-break: break-word;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.link-location-detail-address {
  display: -webkit-box;
  min-width: 0;
  color: #6b7078;
  font-size: 8px;
  font-weight: 560;
  line-height: 1.35;
  overflow: hidden;
  overflow-wrap: anywhere;
  word-break: break-word;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
}

.link-location-footer {
  display: grid;
  grid-template-columns: 13px minmax(0, 1fr) 5px;
  align-items: center;
  gap: 4px;
  min-width: 0;
  min-height: 22px;
  padding: 0 6px;
  background: #ffffff;
  color: #5f6670;
  font-size: 8px;
  font-weight: 820;
}

.link-location-footer > span:nth-child(2) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link-location-footer-mark {
  position: relative;
  display: block;
  width: 11px;
  height: 11px;
  border-radius: 50% 50% 50% 0;
  background: #04c755;
  transform: rotate(-45deg);
}

.link-location-footer-mark::after {
  position: absolute;
  left: 3px;
  top: 3px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #ffffff;
  content: '';
}

.link-location-chevron {
  width: 5px;
  height: 5px;
  border-top: 2px solid #c6c6c6;
  border-right: 2px solid #c6c6c6;
  transform: rotate(45deg);
}

.transfer-compose-preview {
  min-width: 0;
  overflow: hidden;
  border: 1px solid rgba(12, 20, 28, 0.08);
  border-radius: 14px;
  background: #ffffff;
  color: #111111;
  box-shadow: 0 14px 34px rgba(26, 32, 38, 0.1);
}

.transfer-compose-preview {
  display: grid;
  justify-self: center;
  width: min(286px, 100%);
}

.transfer-compose-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  padding: 14px 14px 10px;
  background: #ffffff;
}

.transfer-compose-brand {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  color: #252a31;
  font-size: 12px;
  font-weight: 920;
  line-height: 1;
}

.transfer-compose-brand > span:first-child {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 7px;
  background: #04c755;
  color: #ffffff;
  font-size: 13px;
  font-weight: 950;
}

.transfer-compose-head > span:last-child {
  flex: 0 0 auto;
  padding: 5px 10px;
  border-radius: 999px;
  background: #effaf3;
  color: #05883f;
  font-size: 12px;
  font-weight: 900;
  line-height: 1;
}

.transfer-compose-main {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 0 14px 16px;
  background:
    linear-gradient(135deg, rgba(4, 199, 85, 0.16), rgba(4, 199, 85, 0.04) 72%),
    #f8fffa;
}

.transfer-compose-main small {
  color: #168447;
  font-size: 11px;
  font-weight: 920;
  line-height: 1;
}

.transfer-compose-main strong {
  min-width: 0;
  color: #101713;
  font-size: 40px;
  font-weight: 950;
  letter-spacing: 0;
  line-height: 1;
  overflow-wrap: anywhere;
}

.transfer-compose-main span {
  min-width: 0;
  color: #2f373f;
  font-size: 17px;
  font-weight: 930;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.transfer-compose-note {
  min-width: 0;
  padding: 12px 14px;
  border-top: 1px solid rgba(17, 17, 17, 0.06);
  color: #737983;
  font-size: 12px;
  font-weight: 720;
  line-height: 1.35;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.transfer-field,
.narration-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.transfer-field span,
.narration-field span {
  color: #686b70;
  font-size: 12px;
  font-weight: 900;
}

.transfer-field input,
.transfer-field select,
.narration-field textarea {
  width: 100%;
  min-width: 0;
  min-height: 40px;
  border: 1px solid #edf0f2;
  border-radius: 10px;
  padding: 0 10px;
  background: #ffffff;
  color: #171717;
  font: inherit;
}

.narration-field textarea {
  min-height: 118px;
  padding: 10px;
  resize: vertical;
  line-height: 1.45;
}

.transfer-actions-sheet,
.narration-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.transfer-actions-sheet button,
.narration-actions button {
  min-height: 40px;
}

.transfer-actions-sheet .primary-action,
.narration-actions .primary-action {
  background: #d8dce0;
  color: #202329;
}

.transfer-actions-sheet .primary-action:disabled,
.narration-actions .primary-action:disabled {
  background: #eceef1;
  color: #9ba1a8;
}

.location-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.location-panel-head > div {
  min-width: 0;
}

.location-panel-head p {
  margin: 0 0 3px;
  color: #60646b;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.location-panel-head h3 {
  margin: 0;
  color: #211f24;
  font-size: 16px;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.location-preview-card {
  justify-self: center;
  width: min(188px, 100%);
}

.location-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.location-field span {
  color: #686b70;
  font-size: 12px;
  font-weight: 900;
}

.location-field input,
.location-field select {
  width: 100%;
  min-width: 0;
  min-height: 40px;
  border: 1px solid #edf0f2;
  border-radius: 10px;
  padding: 0 10px;
  background: #ffffff;
  color: #171717;
  font: inherit;
}

.location-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.location-actions button {
  min-height: 40px;
}

.location-actions .primary-action {
  background: #d8dce0;
  color: #202329;
}

.location-actions .primary-action:disabled {
  background: #eceef1;
  color: #9ba1a8;
}

.voice-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.voice-panel-head > div {
  min-width: 0;
}

.voice-panel-head p {
  margin: 0 0 3px;
  color: #3c6f63;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.voice-panel-head h3 {
  margin: 0;
  color: #211f24;
  font-size: 16px;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.voice-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 3px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.74);
}

.voice-tabs button {
  min-width: 0;
  min-height: 34px;
  padding: 6px 8px;
  border-radius: 8px;
  color: #59606a;
  font-size: 12px;
  font-weight: 900;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.voice-tabs button.active {
  background: #ffffff;
  color: #171717;
  box-shadow: 0 1px 8px rgba(37, 31, 37, 0.08);
}

.voice-tabs button:disabled {
  opacity: 0.52;
  cursor: default;
}

.voice-record-tab,
.voice-text-tab {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.voice-recorder-card,
.voice-text-preview {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 54px;
  padding: 10px 12px;
  border-radius: 12px;
  background: #f4f6f5;
  color: #27342f;
}

.voice-recorder-card.recording {
  background: #e9f8ef;
  color: #0a6231;
}

.voice-recorder-card.ready {
  background: #eef6f1;
}

.voice-recorder-card strong,
.voice-text-preview strong {
  min-width: 0;
  font-size: 13px;
  font-weight: 900;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.voice-recorder-card > span {
  font-size: 12px;
  font-weight: 850;
  opacity: 0.68;
}

.voice-preview-wave {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 3px;
  min-height: 18px;
}

.voice-preview-wave span {
  width: 3px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.62;
}

.voice-preview-wave span:nth-child(1) { height: 8px; }
.voice-preview-wave span:nth-child(2) { height: 14px; }
.voice-preview-wave span:nth-child(3) { height: 18px; }
.voice-preview-wave span:nth-child(4) { height: 12px; }
.voice-preview-wave span:nth-child(5) { height: 16px; }

.voice-text-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.voice-text-field span {
  color: #686b70;
  font-size: 12px;
  font-weight: 900;
}

.voice-text-field textarea {
  display: block;
  width: 100%;
  min-width: 0;
  min-height: 98px;
  max-height: min(34dvh, 170px);
  resize: none;
  overflow: auto;
  border: 1px solid #edf0f2;
  border-radius: 10px;
  padding: 10px;
  background: #ffffff;
  color: #171717;
  font: inherit;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  -webkit-overflow-scrolling: touch;
}

.voice-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
}

.voice-secondary,
.voice-primary {
  min-width: 0;
  min-height: 42px;
  padding: 9px 12px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 900;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.voice-secondary {
  background: #eef1f2;
  color: #20272d;
}

.voice-secondary--stop {
  background: #1f2f28;
  color: #ffffff;
}

.voice-primary {
  background: #eff1f3;
  color: #2d333a;
}

.voice-secondary:disabled,
.voice-primary:disabled {
  opacity: 0.45;
  cursor: default;
}

@container (max-width: 320px) {
  .image-send-panel {
    gap: 10px;
  }

  .description-preview {
    width: min(100%, 190px);
    padding: 16px;
    border-radius: 16px;
  }

  .description-preview figcaption {
    font-size: 12px;
    line-height: 1.55;
  }

  .description-field textarea {
    min-height: 96px;
  }
}

@media (max-width: 360px) {
  .image-send-panel {
    gap: 10px;
  }

  .description-preview {
    width: min(100%, 190px);
    padding: 16px;
    border-radius: 16px;
  }

  .description-preview figcaption {
    font-size: 12px;
    line-height: 1.55;
  }

  .description-field textarea {
    min-height: 96px;
  }
}

@media (max-height: 700px) {
  .image-send-panel {
    gap: 10px;
  }

  .description-preview {
    width: min(100%, 180px);
    padding: 16px;
  }

  .description-field textarea {
    min-height: 92px;
    max-height: 28dvh;
  }
}

.local-image-button:disabled,
.description-send-button:disabled {
  opacity: 0.45;
  cursor: default;
}

.typing-indicator {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin: 7px 0 7px 38px;
  padding: 8px 11px;
  border-radius: 15px;
  background: #ffffff;
}

.typing-indicator span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #9da1a6;
  animation: typing 0.9s infinite ease-in-out;
}

.typing-indicator span:nth-child(2) {
  animation-delay: 0.12s;
}

.typing-indicator span:nth-child(3) {
  animation-delay: 0.24s;
}

.selection-toolbar {
  position: relative;
  z-index: 13;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 8px calc(10px + var(--safe-right)) 8px calc(10px + var(--safe-left));
  border-top: 1px solid rgba(20, 20, 20, 0.08);
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(12px);
  transform: translate3d(0, calc(0px - var(--keyboard-inset) - var(--sticker-panel-offset, 0px)), 0);
  will-change: transform;
}

.selection-toolbar strong {
  overflow: hidden;
  color: #2b3036;
  font-size: 13px;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selection-toolbar button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 34px;
  padding: 0 10px;
  border-radius: 8px;
  font-weight: 800;
}

.selection-toolbar button:disabled {
  opacity: 0.45;
}

.action-menu {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.message-action-menu {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.message-action-menu button {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 68px;
  padding: 8px 4px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  color: #202329;
  font-size: 12px;
  font-weight: 800;
}

.message-action-menu button:active {
  background: rgba(6, 199, 85, 0.12);
}

.message-action-menu button:disabled {
  opacity: 0.38;
}

.edit-message-sheet {
  display: grid;
  gap: 10px;
}

.edit-message-sheet textarea {
  width: 100%;
  min-height: 112px;
  resize: vertical;
  border: 1px solid rgba(20, 20, 20, 0.08);
  border-radius: 10px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.86);
  color: #202329;
  font: inherit;
  line-height: 1.5;
}

.edit-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.edit-actions button {
  min-height: 38px;
}

.edit-actions .primary-action {
  background: #d7dbe0;
  color: #22262c;
}

.edit-actions .primary-action:disabled {
  background: #e6e8eb;
  color: #9a9fa6;
}

.delete-confirm-sheet {
  display: grid;
  gap: 10px;
  color: #202329;
}

.delete-confirm-sheet h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 900;
}

.delete-confirm-sheet p {
  margin: 0;
  color: #646a72;
  font-size: 13px;
  line-height: 1.45;
}

.delete-confirm-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.delete-confirm-actions button {
  min-height: 38px;
}

.regenerate-prompt-sheet {
  display: grid;
  gap: 10px;
  color: #202329;
}

.regenerate-prompt-sheet > span {
  color: #6a7079;
  font-size: 11px;
  font-weight: 900;
}

.regenerate-prompt-sheet h3,
.regenerate-prompt-sheet p {
  margin: 0;
}

.regenerate-prompt-sheet h3 {
  font-size: 16px;
  font-weight: 900;
}

.regenerate-prompt-sheet p {
  color: #646a72;
  font-size: 13px;
  line-height: 1.45;
}

.regenerate-prompt-sheet label {
  display: grid;
  gap: 7px;
}

.regenerate-prompt-sheet label span {
  color: #4f565f;
  font-size: 12px;
  font-weight: 850;
}

.regenerate-prompt-sheet textarea {
  width: 100%;
  min-height: 118px;
  resize: vertical;
  padding: 10px;
  border: 1px solid rgba(20, 20, 20, 0.08);
  border-radius: 10px;
  outline: 0;
  background: rgba(255, 255, 255, 0.86);
  color: #202329;
  font: inherit;
  line-height: 1.5;
}

.regenerate-prompt-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.regenerate-prompt-actions button {
  min-height: 38px;
}

.action-menu button {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 58px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  color: #202329;
  font-size: 13px;
  font-weight: 800;
  text-align: center;
  line-height: 1.2;
}

.action-menu button span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.action-menu button:active {
  background: rgba(6, 199, 85, 0.12);
}

.action-menu button:disabled,
.action-menu button.busy {
  opacity: 0.5;
}

.action-menu button.busy {
  cursor: progress;
}

.action-menu .danger-menu-action {
  color: #e5484d;
}

@keyframes typing {
  0%, 100% { transform: translateY(0); opacity: 0.45; }
  50% { transform: translateY(-3px); opacity: 1; }
}
</style>