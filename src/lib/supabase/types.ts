export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      api_keys: {
        Row: {
          createdAt: string
          expiresAt: string | null
          id: string
          isActive: boolean
          key: string
          lastUsedAt: string | null
          name: string
          userId: string
        }
        Insert: {
          createdAt?: string
          expiresAt?: string | null
          id?: string
          isActive?: boolean
          key: string
          lastUsedAt?: string | null
          name: string
          userId: string
        }
        Update: {
          createdAt?: string
          expiresAt?: string | null
          id?: string
          isActive?: boolean
          key?: string
          lastUsedAt?: string | null
          name?: string
          userId?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          createdAt: string
          id: string
          ipAddress: string | null
          metadata: Json | null
          resourceId: string | null
          resourceType: string
          userAgent: string | null
          userId: string | null
        }
        Insert: {
          action: string
          createdAt?: string
          id?: string
          ipAddress?: string | null
          metadata?: Json | null
          resourceId?: string | null
          resourceType: string
          userAgent?: string | null
          userId?: string | null
        }
        Update: {
          action?: string
          createdAt?: string
          id?: string
          ipAddress?: string | null
          metadata?: Json | null
          resourceId?: string | null
          resourceType?: string
          userAgent?: string | null
          userId?: string | null
        }
        Relationships: []
      }
      candidates: {
        Row: {
          birthday: string | null
          createdAt: string
          cvAnalysis: Json | null
          education: string | null
          email: string | null
          endDate: string | null
          evaluationStatus: Database["public"]["Enums"]["EvaluationStatus"]
          gender: string | null
          graduationYear: number | null
          hrComments: Json | null
          id: string
          interviewId: string
          invitedAt: string | null
          inviteToken: string | null
          major: string | null
          name: string
          notes: string | null
          phone: string | null
          school: string | null
          sessionId: string | null
          startDate: string | null
          updatedAt: string
          workExperience: string | null
        }
        Insert: {
          birthday?: string | null
          createdAt?: string
          cvAnalysis?: Json | null
          education?: string | null
          email?: string | null
          endDate?: string | null
          evaluationStatus?: Database["public"]["Enums"]["EvaluationStatus"]
          gender?: string | null
          graduationYear?: number | null
          hrComments?: Json | null
          id?: string
          interviewId: string
          invitedAt?: string | null
          inviteToken?: string | null
          major?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          school?: string | null
          sessionId?: string | null
          startDate?: string | null
          updatedAt?: string
          workExperience?: string | null
        }
        Update: {
          birthday?: string | null
          createdAt?: string
          cvAnalysis?: Json | null
          education?: string | null
          email?: string | null
          endDate?: string | null
          evaluationStatus?: Database["public"]["Enums"]["EvaluationStatus"]
          gender?: string | null
          graduationYear?: number | null
          hrComments?: Json | null
          id?: string
          interviewId?: string
          invitedAt?: string | null
          inviteToken?: string | null
          major?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          school?: string | null
          sessionId?: string | null
          startDate?: string | null
          updatedAt?: string
          workExperience?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidates_interviewId_fkey"
            columns: ["interviewId"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidates_sessionId_fkey"
            columns: ["sessionId"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_candidates: {
        Row: {
          birthday: string | null
          createdAt: string | null
          cvAnalysis: Json | null
          education: string | null
          email: string | null
          endDate: string | null
          evaluationStatus: string | null
          gender: string | null
          graduationYear: number | null
          hrComments: Json | null
          id: string
          invitedAt: string | null
          inviteToken: string | null
          major: string | null
          name: string
          notes: string | null
          phone: string | null
          school: string | null
          sessionId: string | null
          startDate: string | null
          trainingId: string
          updatedAt: string | null
          workExperience: string | null
        }
        Insert: {
          birthday?: string | null
          createdAt?: string | null
          cvAnalysis?: Json | null
          education?: string | null
          email?: string | null
          endDate?: string | null
          evaluationStatus?: string | null
          gender?: string | null
          graduationYear?: number | null
          hrComments?: Json | null
          id?: string
          invitedAt?: string | null
          inviteToken?: string | null
          major?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          school?: string | null
          sessionId?: string | null
          startDate?: string | null
          trainingId: string
          updatedAt?: string | null
          workExperience?: string | null
        }
        Update: {
          birthday?: string | null
          createdAt?: string | null
          cvAnalysis?: Json | null
          education?: string | null
          email?: string | null
          endDate?: string | null
          evaluationStatus?: string | null
          gender?: string | null
          graduationYear?: number | null
          hrComments?: Json | null
          id?: string
          invitedAt?: string | null
          inviteToken?: string | null
          major?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          school?: string | null
          sessionId?: string | null
          startDate?: string | null
          trainingId?: string
          updatedAt?: string | null
          workExperience?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coaching_candidates_sessionId_fkey"
            columns: ["sessionId"]
            isOneToOne: false
            referencedRelation: "coaching_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_candidates_trainingId_fkey"
            columns: ["trainingId"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_email_send_logs: {
        Row: {
          candidateId: string | null
          errorMessage: string | null
          id: string
          messageId: string | null
          recipientEmail: string
          recipientName: string | null
          sentAt: string | null
          sentBy: string
          status: string
          subject: string
          trainingId: string
        }
        Insert: {
          candidateId?: string | null
          errorMessage?: string | null
          id?: string
          messageId?: string | null
          recipientEmail: string
          recipientName?: string | null
          sentAt?: string | null
          sentBy: string
          status: string
          subject: string
          trainingId: string
        }
        Update: {
          candidateId?: string | null
          errorMessage?: string | null
          id?: string
          messageId?: string | null
          recipientEmail?: string
          recipientName?: string | null
          sentAt?: string | null
          sentBy?: string
          status?: string
          subject?: string
          trainingId?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_email_send_logs_candidateId_fkey"
            columns: ["candidateId"]
            isOneToOne: false
            referencedRelation: "coaching_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_email_send_logs_trainingId_fkey"
            columns: ["trainingId"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_email_templates: {
        Row: {
          body: string
          createdAt: string | null
          id: string
          logoUrl: string | null
          reminderBody: string | null
          reminderSubject: string | null
          replyTo: string | null
          subject: string
          trainingId: string
          updatedAt: string | null
        }
        Insert: {
          body: string
          createdAt?: string | null
          id?: string
          logoUrl?: string | null
          reminderBody?: string | null
          reminderSubject?: string | null
          replyTo?: string | null
          subject: string
          trainingId: string
          updatedAt?: string | null
        }
        Update: {
          body?: string
          createdAt?: string | null
          id?: string
          logoUrl?: string | null
          reminderBody?: string | null
          reminderSubject?: string | null
          replyTo?: string | null
          subject?: string
          trainingId?: string
          updatedAt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coaching_email_templates_trainingId_fkey"
            columns: ["trainingId"]
            isOneToOne: true
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_sessions: {
        Row: {
          completedAt: string | null
          id: string
          language: string | null
          metadata: Json | null
          participantEmail: string | null
          participantName: string | null
          quiz_results: Json | null
          startedAt: string | null
          status: string | null
          trainingId: string
        }
        Insert: {
          completedAt?: string | null
          id?: string
          language?: string | null
          metadata?: Json | null
          participantEmail?: string | null
          participantName?: string | null
          quiz_results?: Json | null
          startedAt?: string | null
          status?: string | null
          trainingId: string
        }
        Update: {
          completedAt?: string | null
          id?: string
          language?: string | null
          metadata?: Json | null
          participantEmail?: string | null
          participantName?: string | null
          quiz_results?: Json | null
          startedAt?: string | null
          status?: string | null
          trainingId?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_sessions_trainingId_fkey"
            columns: ["trainingId"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_rates: {
        Row: {
          credits: number
          interviewType: string
          minutes: number
          updatedAt: string
        }
        Insert: {
          credits?: number
          interviewType: string
          minutes?: number
          updatedAt?: string
        }
        Update: {
          credits?: number
          interviewType?: string
          minutes?: number
          updatedAt?: string
        }
        Relationships: []
      }
      email_send_logs: {
        Row: {
          candidateId: string | null
          errorMessage: string | null
          id: string
          interviewId: string
          messageId: string | null
          recipientEmail: string
          recipientName: string | null
          sentAt: string
          sentBy: string
          status: string
          subject: string
        }
        Insert: {
          candidateId?: string | null
          errorMessage?: string | null
          id?: string
          interviewId: string
          messageId?: string | null
          recipientEmail: string
          recipientName?: string | null
          sentAt?: string
          sentBy: string
          status?: string
          subject: string
        }
        Update: {
          candidateId?: string | null
          errorMessage?: string | null
          id?: string
          interviewId?: string
          messageId?: string | null
          recipientEmail?: string
          recipientName?: string | null
          sentAt?: string
          sentBy?: string
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_send_logs_candidateId_fkey"
            columns: ["candidateId"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_send_logs_interviewId_fkey"
            columns: ["interviewId"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body: string
          createdAt: string
          id: string
          interviewId: string
          logoUrl: string | null
          reminderBody: string
          reminderSubject: string
          replyTo: string | null
          subject: string
          updatedAt: string
        }
        Insert: {
          body?: string
          createdAt?: string
          id?: string
          interviewId: string
          logoUrl?: string | null
          reminderBody?: string
          reminderSubject?: string
          replyTo?: string | null
          subject?: string
          updatedAt?: string
        }
        Update: {
          body?: string
          createdAt?: string
          id?: string
          interviewId?: string
          logoUrl?: string | null
          reminderBody?: string
          reminderSubject?: string
          replyTo?: string | null
          subject?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_interviewId_fkey"
            columns: ["interviewId"]
            isOneToOne: true
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      interviews: {
        Row: {
          aiName: string
          aiPersona: string | null
          aiTone: Database["public"]["Enums"]["ToneLevel"]
          allowModeSwitch: boolean
          antiCheatingEnabled: boolean
          assessmentCriteria: Json | null
          avatarImageUrl: string | null
          avatarMode: string
          avatarVoice: string | null
          chatEnabled: boolean
          codeEnabled: boolean
          createdAt: string
          customBranding: Json | null
          cvAssessmentCriteria: Json | null
          cvJdAlignmentCriteria: Json | null
          description: string | null
          followUpDepth: Database["public"]["Enums"]["FollowUpDepth"]
          id: string
          interaction_mode: string | null
          invitedEmails: string[]
          is_voice_only: boolean | null
          isActive: boolean
          jobDescription: string | null
          language: string
          llmModel: string | null
          llmProvider: string | null
          mode: Database["public"]["Enums"]["InterviewMode"]
          multilingualEnabled: boolean
          objective: string | null
          pregenerated_videos: Json | null
          projectId: string | null
          publicSlug: string | null
          requireInvite: boolean
          timeLimitMinutes: number | null
          title: string
          updatedAt: string
          userId: string
          videoEnabled: boolean
          videoMode: boolean
          voiceEnabled: boolean
          whiteboardEnabled: boolean
        }
        Insert: {
          aiName?: string
          aiPersona?: string | null
          aiTone?: Database["public"]["Enums"]["ToneLevel"]
          allowModeSwitch?: boolean
          antiCheatingEnabled?: boolean
          assessmentCriteria?: Json | null
          avatarImageUrl?: string | null
          avatarMode?: string
          avatarVoice?: string | null
          chatEnabled?: boolean
          codeEnabled?: boolean
          createdAt?: string
          customBranding?: Json | null
          cvAssessmentCriteria?: Json | null
          cvJdAlignmentCriteria?: Json | null
          description?: string | null
          followUpDepth?: Database["public"]["Enums"]["FollowUpDepth"]
          id?: string
          interaction_mode?: string | null
          invitedEmails?: string[]
          is_voice_only?: boolean | null
          isActive?: boolean
          jobDescription?: string | null
          language?: string
          llmModel?: string | null
          llmProvider?: string | null
          mode?: Database["public"]["Enums"]["InterviewMode"]
          multilingualEnabled?: boolean
          objective?: string | null
          pregenerated_videos?: Json | null
          projectId?: string | null
          publicSlug?: string | null
          requireInvite?: boolean
          timeLimitMinutes?: number | null
          title: string
          updatedAt?: string
          userId: string
          videoEnabled?: boolean
          videoMode?: boolean
          voiceEnabled?: boolean
          whiteboardEnabled?: boolean
        }
        Update: {
          aiName?: string
          aiPersona?: string | null
          aiTone?: Database["public"]["Enums"]["ToneLevel"]
          allowModeSwitch?: boolean
          antiCheatingEnabled?: boolean
          assessmentCriteria?: Json | null
          avatarImageUrl?: string | null
          avatarMode?: string
          avatarVoice?: string | null
          chatEnabled?: boolean
          codeEnabled?: boolean
          createdAt?: string
          customBranding?: Json | null
          cvAssessmentCriteria?: Json | null
          cvJdAlignmentCriteria?: Json | null
          description?: string | null
          followUpDepth?: Database["public"]["Enums"]["FollowUpDepth"]
          id?: string
          interaction_mode?: string | null
          invitedEmails?: string[]
          is_voice_only?: boolean | null
          isActive?: boolean
          jobDescription?: string | null
          language?: string
          llmModel?: string | null
          llmProvider?: string | null
          mode?: Database["public"]["Enums"]["InterviewMode"]
          multilingualEnabled?: boolean
          objective?: string | null
          pregenerated_videos?: Json | null
          projectId?: string | null
          publicSlug?: string | null
          requireInvite?: boolean
          timeLimitMinutes?: number | null
          title?: string
          updatedAt?: string
          userId?: string
          videoEnabled?: boolean
          videoMode?: boolean
          voiceEnabled?: boolean
          whiteboardEnabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "interviews_projectId_fkey"
            columns: ["projectId"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      jobTemplates: {
        Row: {
          createdAt: string
          id: string
          interviewQuestions: Json
          jobDescription: string
          jobType: string
          scoringRubric: Json
          title: string
          updatedAt: string
        }
        Insert: {
          createdAt?: string
          id?: string
          interviewQuestions?: Json
          jobDescription: string
          jobType: string
          scoringRubric?: Json
          title: string
          updatedAt?: string
        }
        Update: {
          createdAt?: string
          id?: string
          interviewQuestions?: Json
          jobDescription?: string
          jobType?: string
          scoringRubric?: Json
          title?: string
          updatedAt?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          audioDurationSeconds: number | null
          audioUrl: string | null
          content: string
          contentType: Database["public"]["Enums"]["ContentType"]
          id: string
          isFollowUp: boolean
          parentMessageId: string | null
          questionId: string | null
          readingTimeSeconds: number | null
          role: Database["public"]["Enums"]["MessageRole"]
          sentiment: string | null
          sessionId: string
          timestamp: string
          transcription: string | null
          whiteboardData: Json | null
          whiteboardImageUrl: string | null
          whiteboardPages: number
          wordCount: number | null
        }
        Insert: {
          audioDurationSeconds?: number | null
          audioUrl?: string | null
          content: string
          contentType?: Database["public"]["Enums"]["ContentType"]
          id?: string
          isFollowUp?: boolean
          parentMessageId?: string | null
          questionId?: string | null
          readingTimeSeconds?: number | null
          role: Database["public"]["Enums"]["MessageRole"]
          sentiment?: string | null
          sessionId: string
          timestamp?: string
          transcription?: string | null
          whiteboardData?: Json | null
          whiteboardImageUrl?: string | null
          whiteboardPages?: number
          wordCount?: number | null
        }
        Update: {
          audioDurationSeconds?: number | null
          audioUrl?: string | null
          content?: string
          contentType?: Database["public"]["Enums"]["ContentType"]
          id?: string
          isFollowUp?: boolean
          parentMessageId?: string | null
          questionId?: string | null
          readingTimeSeconds?: number | null
          role?: Database["public"]["Enums"]["MessageRole"]
          sentiment?: string | null
          sessionId?: string
          timestamp?: string
          transcription?: string | null
          whiteboardData?: Json | null
          whiteboardImageUrl?: string | null
          whiteboardPages?: number
          wordCount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_sessionId_fkey"
            columns: ["sessionId"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          id: string
          joinedAt: string
          role: Database["public"]["Enums"]["MemberRole"]
          userId: string
          workspaceId: string
        }
        Insert: {
          id?: string
          joinedAt?: string
          role?: Database["public"]["Enums"]["MemberRole"]
          userId: string
          workspaceId: string
        }
        Update: {
          id?: string
          joinedAt?: string
          role?: Database["public"]["Enums"]["MemberRole"]
          userId?: string
          workspaceId?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_workspaceId_fkey"
            columns: ["workspaceId"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          coachingEnabled: boolean
          createdAt: string
          credits: number
          expireDate: string | null
          id: string
          interviewEnabled: boolean
          name: string
          ownerId: string
          slug: string
          startDate: string | null
          updatedAt: string
        }
        Insert: {
          coachingEnabled?: boolean
          createdAt?: string
          credits?: number
          expireDate?: string | null
          id?: string
          interviewEnabled?: boolean
          name: string
          ownerId: string
          slug: string
          startDate?: string | null
          updatedAt?: string
        }
        Update: {
          coachingEnabled?: boolean
          createdAt?: string
          credits?: number
          expireDate?: string | null
          id?: string
          interviewEnabled?: boolean
          name?: string
          ownerId?: string
          slug?: string
          startDate?: string | null
          updatedAt?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar: string | null
          createdAt: string
          email: string
          id: string
          name: string | null
          organization: string | null
          role: Database["public"]["Enums"]["UserRole"]
          updatedAt: string
        }
        Insert: {
          avatar?: string | null
          createdAt?: string
          email: string
          id: string
          name?: string | null
          organization?: string | null
          role?: Database["public"]["Enums"]["UserRole"]
          updatedAt?: string
        }
        Update: {
          avatar?: string | null
          createdAt?: string
          email?: string
          id?: string
          name?: string | null
          organization?: string | null
          role?: Database["public"]["Enums"]["UserRole"]
          updatedAt?: string
        }
        Relationships: []
      }
      project_members: {
        Row: {
          assignedAt: string
          id: string
          projectId: string
          role: Database["public"]["Enums"]["MemberRole"]
          userId: string
        }
        Insert: {
          assignedAt?: string
          id?: string
          projectId: string
          role?: Database["public"]["Enums"]["MemberRole"]
          userId: string
        }
        Update: {
          assignedAt?: string
          id?: string
          projectId?: string
          role?: Database["public"]["Enums"]["MemberRole"]
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_projectId_fkey"
            columns: ["projectId"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          createdAt: string
          createdBy: string
          defaultLlmModel: string | null
          description: string | null
          id: string
          name: string
          organizationId: string
          updatedAt: string
        }
        Insert: {
          createdAt?: string
          createdBy: string
          defaultLlmModel?: string | null
          description?: string | null
          id?: string
          name: string
          organizationId: string
          updatedAt?: string
        }
        Update: {
          createdAt?: string
          createdBy?: string
          defaultLlmModel?: string | null
          description?: string | null
          id?: string
          name?: string
          organizationId?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_organizationId_fkey"
            columns: ["organizationId"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          allowedFileTypes: string[]
          allowFileUpload: boolean
          createdAt: string
          description: string | null
          followUpPrompts: Json | null
          id: string
          interviewId: string
          isRequired: boolean
          options: Json | null
          order: number
          probeOnShort: boolean
          probeThreshold: number | null
          showIf: Json | null
          skipIf: Json | null
          starterCode: Json | null
          text: string
          timeLimitSeconds: number | null
          type: Database["public"]["Enums"]["QuestionType"]
          updatedAt: string
          validationRules: Json | null
        }
        Insert: {
          allowedFileTypes?: string[]
          allowFileUpload?: boolean
          createdAt?: string
          description?: string | null
          followUpPrompts?: Json | null
          id?: string
          interviewId: string
          isRequired?: boolean
          options?: Json | null
          order: number
          probeOnShort?: boolean
          probeThreshold?: number | null
          showIf?: Json | null
          skipIf?: Json | null
          starterCode?: Json | null
          text: string
          timeLimitSeconds?: number | null
          type: Database["public"]["Enums"]["QuestionType"]
          updatedAt?: string
          validationRules?: Json | null
        }
        Update: {
          allowedFileTypes?: string[]
          allowFileUpload?: boolean
          createdAt?: string
          description?: string | null
          followUpPrompts?: Json | null
          id?: string
          interviewId?: string
          isRequired?: boolean
          options?: Json | null
          order?: number
          probeOnShort?: boolean
          probeThreshold?: number | null
          showIf?: Json | null
          skipIf?: Json | null
          starterCode?: Json | null
          text?: string
          timeLimitSeconds?: number | null
          type?: Database["public"]["Enums"]["QuestionType"]
          updatedAt?: string
          validationRules?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_interviewId_fkey"
            columns: ["interviewId"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          activitySegments: Json
          antiCheatingLog: Json
          audioDuration: number | null
          audioRecordings: Json
          audioRecordingUrl: string | null
          completedAt: string | null
          createdAt: string
          currentQuestionId: string | null
          evaluationStatus: Database["public"]["Enums"]["EvaluationStatus"]
          id: string
          insights: Json | null
          interviewId: string
          language: string | null
          lastActivityAt: string
          modeSwitches: number
          modeUsed: Database["public"]["Enums"]["InterviewMode"]
          participantEmail: string | null
          participantMetadata: Json | null
          participantName: string | null
          participantPhone: string | null
          questionsAsked: string[]
          screenshots: Json | null
          sentiment: Json | null
          startedAt: string
          status: Database["public"]["Enums"]["SessionStatus"]
          summary: string | null
          themes: string[]
          tokenUsage: Json | null
          totalDurationSeconds: number | null
          updatedAt: string
          videoRecordingUrl: string | null
        }
        Insert: {
          activitySegments?: Json
          antiCheatingLog?: Json
          audioDuration?: number | null
          audioRecordings?: Json
          audioRecordingUrl?: string | null
          completedAt?: string | null
          createdAt?: string
          currentQuestionId?: string | null
          evaluationStatus?: Database["public"]["Enums"]["EvaluationStatus"]
          id?: string
          insights?: Json | null
          interviewId: string
          language?: string | null
          lastActivityAt?: string
          modeSwitches?: number
          modeUsed?: Database["public"]["Enums"]["InterviewMode"]
          participantEmail?: string | null
          participantMetadata?: Json | null
          participantName?: string | null
          participantPhone?: string | null
          questionsAsked?: string[]
          screenshots?: Json | null
          sentiment?: Json | null
          startedAt?: string
          status?: Database["public"]["Enums"]["SessionStatus"]
          summary?: string | null
          themes?: string[]
          tokenUsage?: Json | null
          totalDurationSeconds?: number | null
          updatedAt?: string
          videoRecordingUrl?: string | null
        }
        Update: {
          activitySegments?: Json
          antiCheatingLog?: Json
          audioDuration?: number | null
          audioRecordings?: Json
          audioRecordingUrl?: string | null
          completedAt?: string | null
          createdAt?: string
          currentQuestionId?: string | null
          evaluationStatus?: Database["public"]["Enums"]["EvaluationStatus"]
          id?: string
          insights?: Json | null
          interviewId?: string
          language?: string | null
          lastActivityAt?: string
          modeSwitches?: number
          modeUsed?: Database["public"]["Enums"]["InterviewMode"]
          participantEmail?: string | null
          participantMetadata?: Json | null
          participantName?: string | null
          participantPhone?: string | null
          questionsAsked?: string[]
          screenshots?: Json | null
          sentiment?: Json | null
          startedAt?: string
          status?: Database["public"]["Enums"]["SessionStatus"]
          summary?: string | null
          themes?: string[]
          tokenUsage?: Json | null
          totalDurationSeconds?: number | null
          updatedAt?: string
          videoRecordingUrl?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_interviewId_fkey"
            columns: ["interviewId"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          attachments: Json | null
          created_at: string
          email: string | null
          id: string
          message: string
          severity: string | null
          status: string
          topic: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attachments?: Json | null
          created_at?: string
          email?: string | null
          id?: string
          message: string
          severity?: string | null
          status?: string
          topic?: string | null
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attachments?: Json | null
          created_at?: string
          email?: string | null
          id?: string
          message?: string
          severity?: string | null
          status?: string
          topic?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      trainings: {
        Row: {
          aiName: string | null
          aiTone: string | null
          avatarImageUrl: string | null
          avatarMode: string | null
          avatarVoice: string | null
          createdAt: string | null
          description: string | null
          generation_status: string | null
          id: string
          isActive: boolean | null
          language: string | null
          multilingualEnabled: boolean
          objective: string | null
          organizationId: string
          pregenerated_videos: Json | null
          presentation_text: string | null
          projectId: string | null
          publicSlug: string | null
          quiz_questions: Json | null
          quiz_settings: Json | null
          script_slides: Json | null
          timeLimitMinutes: number | null
          title: string
          updatedAt: string | null
          userId: string | null
        }
        Insert: {
          aiName?: string | null
          aiTone?: string | null
          avatarImageUrl?: string | null
          avatarMode?: string | null
          avatarVoice?: string | null
          createdAt?: string | null
          description?: string | null
          generation_status?: string | null
          id?: string
          isActive?: boolean | null
          language?: string | null
          multilingualEnabled?: boolean
          objective?: string | null
          organizationId: string
          pregenerated_videos?: Json | null
          presentation_text?: string | null
          projectId?: string | null
          publicSlug?: string | null
          quiz_questions?: Json | null
          quiz_settings?: Json | null
          script_slides?: Json | null
          timeLimitMinutes?: number | null
          title: string
          updatedAt?: string | null
          userId?: string | null
        }
        Update: {
          aiName?: string | null
          aiTone?: string | null
          avatarImageUrl?: string | null
          avatarMode?: string | null
          avatarVoice?: string | null
          createdAt?: string | null
          description?: string | null
          generation_status?: string | null
          id?: string
          isActive?: boolean | null
          language?: string | null
          multilingualEnabled?: boolean
          objective?: string | null
          organizationId?: string
          pregenerated_videos?: Json | null
          presentation_text?: string | null
          projectId?: string | null
          publicSlug?: string | null
          quiz_questions?: Json | null
          quiz_settings?: Json | null
          script_slides?: Json | null
          timeLimitMinutes?: number | null
          title?: string
          updatedAt?: string | null
          userId?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trainings_organizationId_fkey"
            columns: ["organizationId"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainings_projectId_fkey"
            columns: ["projectId"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          createdAt: string
          events: string[]
          id: string
          isActive: boolean
          secret: string | null
          updatedAt: string
          url: string
          userId: string
        }
        Insert: {
          createdAt?: string
          events?: string[]
          id?: string
          isActive?: boolean
          secret?: string | null
          updatedAt?: string
          url: string
          userId: string
        }
        Update: {
          createdAt?: string
          events?: string[]
          id?: string
          isActive?: boolean
          secret?: string | null
          updatedAt?: string
          url?: string
          userId?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_interview_session: {
        Args: {
          p_current_question_id?: string
          p_interview_id: string
          p_mode_used?: Database["public"]["Enums"]["InterviewMode"]
          p_participant_email?: string
          p_participant_name?: string
        }
        Returns: Json
      }
      create_invite_session: {
        Args: {
          p_current_question_id?: string
          p_invite_token: string
          p_mode_used?: Database["public"]["Enums"]["InterviewMode"]
        }
        Returns: Json
      }
      create_organization: {
        Args: { org_name: string; org_slug: string }
        Returns: Json
      }
      is_org_member: { Args: { org_id: string }; Returns: boolean }
    }
    Enums: {
      ContentType: "TEXT" | "AUDIO" | "FILE" | "IMAGE" | "WHITEBOARD" | "CODE"
      EvaluationStatus: "PENDING" | "SHORTLISTED" | "WAITLISTED" | "REJECTED"
      FollowUpDepth: "LIGHT" | "MODERATE" | "DEEP"
      InterviewMode: "CHAT" | "VOICE" | "HYBRID"
      MemberRole: "SYSTEM_ADMIN" | "ACCOUNT_ADMIN" | "EDITOR" | "VIEWER"
      MessageRole: "USER" | "ASSISTANT" | "SYSTEM"
      QuestionType:
        | "OPEN_ENDED"
        | "SINGLE_CHOICE"
        | "MULTIPLE_CHOICE"
        | "CODING"
        | "WHITEBOARD"
        | "RESEARCH"
      SessionStatus: "IN_PROGRESS" | "COMPLETED" | "ABANDONED"
      ToneLevel: "CASUAL" | "PROFESSIONAL" | "FORMAL" | "FRIENDLY"
      UserRole: "USER" | "ADMIN" | "ENTERPRISE"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      ContentType: ["TEXT", "AUDIO", "FILE", "IMAGE", "WHITEBOARD", "CODE"],
      EvaluationStatus: ["PENDING", "SHORTLISTED", "WAITLISTED", "REJECTED"],
      FollowUpDepth: ["LIGHT", "MODERATE", "DEEP"],
      InterviewMode: ["CHAT", "VOICE", "HYBRID"],
      MemberRole: ["SYSTEM_ADMIN", "ACCOUNT_ADMIN", "EDITOR", "VIEWER"],
      MessageRole: ["USER", "ASSISTANT", "SYSTEM"],
      QuestionType: [
        "OPEN_ENDED",
        "SINGLE_CHOICE",
        "MULTIPLE_CHOICE",
        "CODING",
        "WHITEBOARD",
        "RESEARCH",
      ],
      SessionStatus: ["IN_PROGRESS", "COMPLETED", "ABANDONED"],
      ToneLevel: ["CASUAL", "PROFESSIONAL", "FORMAL", "FRIENDLY"],
      UserRole: ["USER", "ADMIN", "ENTERPRISE"],
    },
  },
} as const

