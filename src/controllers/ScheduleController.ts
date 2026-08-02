import { Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { ScheduleService } from "../services/schedule.service";
import { validateScheduleTasks, validateScheduleLinks, ValidationError } from "../dto/schedule.dto";

// schedule endpoints (get/save) — schedule tab and task tab share the Task table (see schedule.service.ts)
export class ScheduleController {
  constructor(private scheduleService: ScheduleService) {}

  getSchedule = async (req: AuthRequest, res: Response): Promise<void> => {
    const projectId = req.params.projectId as string | undefined;
    if (!projectId) {
      res.status(400).json({ message: "projectId is required." });
      return;
    }
    try {
      const { tasks, links } = await this.scheduleService.getSchedule(projectId, req.organization!.id);
      res.json({ tasks, links });
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({ message: err.message });
        return;
      }
      console.error("[schedule] getSchedule failed:", err);
      res.status(500).json({ message: "Failed to load schedule." });
    }
  };

  saveSchedule = async (req: AuthRequest, res: Response): Promise<void> => {
    const projectId = req.params.projectId as string | undefined;
    if (!projectId) {
      res.status(400).json({ message: "projectId is required." });
      return;
    }
    try {
      const tasks = validateScheduleTasks(req.body?.tasks);
      const taskIds = new Set(tasks.map((task) => task.id));
      const links = validateScheduleLinks(req.body?.links, taskIds);
      const saved = await this.scheduleService.saveSchedule(
        projectId,
        req.organization!.id,
        req.user?.id ?? null,
        tasks,
        links,
      );
      res.json({ tasks: saved.tasks, links: saved.links });
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
