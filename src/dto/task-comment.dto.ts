/** Body shape for POST /tasks/:taskId/comments and POST /tasks/:taskId/subtasks/:subtaskId/comments. */
export interface AddCommentDto {
  commentText: string;
}

/** Body shape for the task/subtask comment "feedback" endpoints. */
export interface AddFeedbackDto {
  feedback: string;
}
