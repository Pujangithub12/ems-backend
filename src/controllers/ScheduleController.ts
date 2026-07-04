import { Request, Response } from "express";
import { ScheduleService } from "../services/schedule.service";
import { validateScheduleTasks, ValidationError } from "../dto/schedule.dto";

// schedule endpoints (get/save) — full-replace persistence
export class ScheduleController {
  constructor(private scheduleService: ScheduleService) {}

  getSchedule = async (req: Request, res: Response): Promise<void> => {
    const projectId = req.params.projectId as string | undefined;
    if (!projectId) {
      res.status(400).json({ message: "projectId is required." });
      return;
    }
    try {
      const tasks = await this.scheduleService.getSchedule(projectId);
      res.json({ tasks });
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({ message: err.message });
        return;
      }
      console.error("[schedule] getSchedule failed:", err);
      res.status(500).json({ message: "Failed to load schedule." });
    }
  };

  saveSchedule = async (req: Request, res: Response): Promise<void> => {
    const projectId = req.params.projectId as string | undefined;
    if (!projectId) {
      res.status(400).json({ message: "projectId is required." });
      return;
    }
    try {
      const tasks = validateScheduleTasks(req.body?.tasks);
      const saved = await this.scheduleService.saveSchedule(projectId, tasks);
      res.json({ tasks: saved });
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({ message: err.message });
        return;
      }
      console.error("[schedule] saveSchedule failed:", err);
      res.status(500).json({ message: "Failed to save schedule." });
    }
  };
}
