import { Response } from "express";
import { AppDataSource } from "../config/data-source";
import { HierarchyNode } from "../entities/HierarchyNode";
import { User } from "../entities/User";
import { UserRole } from "../entities/TaskEnums";
import { AuthRequest } from "../middlewares/auth";

// Interface for frontend tree node
interface FrontendTreeNode {
  id: string;
  dbId?: number;
  label?: string;
  userId?: number;
  children: FrontendTreeNode[];
}

// Helper to build tree from flat DB list
const buildTreeFromDB = (nodes: HierarchyNode[]): FrontendTreeNode | null => {
  const nodeMap = new Map<number, FrontendTreeNode>();
  const rootNodes: FrontendTreeNode[] = [];

  // First pass: create all nodes
  nodes.forEach((node) => {
    const frontendNode: FrontendTreeNode = {
      id: `node-${node.id}`,
      dbId: node.id,
      label: node.label || node.user?.fullName || "Unknown",
      children: [],
    };
    if (node.userId !== undefined) {
      frontendNode.userId = node.userId;
    }
    nodeMap.set(node.id, frontendNode);
  });

  // Second pass: build hierarchy
  nodes.forEach((node) => {
    const currentNode = nodeMap.get(node.id)!;
    if (node.parentId) {
      const parentNode = nodeMap.get(node.parentId);
      if (parentNode) {
        parentNode.children.push(currentNode);
      }
    } else {
      rootNodes.push(currentNode);
    }
  });

  // Sort children by orderIndex
  const sortChildren = (nodeList: FrontendTreeNode[]) => {
    nodeList.sort((a, b) => {
      const nodeA = nodes.find((n) => n.id === a.dbId);
      const nodeB = nodes.find((n) => n.id === b.dbId);
      return (nodeA?.orderIndex || 0) - (nodeB?.orderIndex || 0);
    });
    nodeList.forEach((n) => sortChildren(n.children));
  };
  sortChildren(rootNodes);

  return rootNodes.length > 0 ? rootNodes[0]! : null;
};

export class HierarchyController {
  // Get hierarchy tree for current workspace
  static async getHierarchy(req: AuthRequest, res: Response) {
    try {
      const workspaceId = req.workspace?.id;
      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace not found" });
      }

      const hierarchyRepo = AppDataSource.getRepository(HierarchyNode);
      let nodes = await hierarchyRepo.find({
        where: { workspaceId },
        relations: ["user"],
        order: { orderIndex: "ASC" },
      });

      // If no hierarchy exists, create default one
      if (nodes.length === 0) {
        const userRepo = AppDataSource.getRepository(User);

        // Find super admin
        let superAdmin = await userRepo.findOne({
          where: { role: UserRole.SUPER_ADMIN },
        });

        // If no super admin, use current user
        if (!superAdmin && req.user) {
          superAdmin = await userRepo.findOne({
            where: { id: req.user.id },
          });
        }

        // Create root node
        const rootNode = hierarchyRepo.create({
          label: "Organization",
          workspaceId,
          orderIndex: 0,
        });
        const savedRoot = await hierarchyRepo.save(rootNode);

        // Create super admin child node if we have a user
        if (superAdmin) {
          const adminNode = hierarchyRepo.create({
            userId: superAdmin.id,
            user: superAdmin,
            parentId: savedRoot.id,
            workspaceId,
            orderIndex: 0,
          });
          await hierarchyRepo.save(adminNode);
        }

        // Fetch again to get all nodes
        nodes = await hierarchyRepo.find({
          where: { workspaceId },
          relations: ["user"],
          order: { orderIndex: "ASC" },
        });
      }

      const tree = buildTreeFromDB(nodes);
      return res.status(200).json(tree);
    } catch (error) {
      console.error("Error fetching hierarchy:", error);
      return res.status(500).json({ message: "Failed to fetch hierarchy" });
    }
  }

  // Save hierarchy tree for current workspace
  static async saveHierarchy(req: AuthRequest, res: Response) {
    try {
      const workspaceId = req.workspace?.id;
      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace not found" });
      }

      const { tree } = req.body;
      if (!tree) {
        return res.status(400).json({ message: "Tree is required" });
      }

      const hierarchyRepo = AppDataSource.getRepository(HierarchyNode);

      // Delete all existing nodes for this workspace first
      await hierarchyRepo.delete({ workspaceId });

      // Function to recursively save nodes
      const saveNode = async (
        node: FrontendTreeNode,
        parentDbId?: number,
        orderIndex: number = 0,
      ): Promise<HierarchyNode> => {
        const newNodeData: Partial<HierarchyNode> = {
          workspaceId,
          orderIndex,
        };
        if (node.label !== undefined) {
          newNodeData.label = node.label;
        }
        if (node.userId !== undefined) {
          newNodeData.userId = node.userId;
        }
        if (parentDbId !== undefined) {
          newNodeData.parentId = parentDbId;
        }

        const newNode = hierarchyRepo.create(newNodeData);

        const savedNode = await hierarchyRepo.save(newNode);

        // Save children
        const children = node.children || [];
        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          if (child) {
            await saveNode(child, savedNode.id, i);
          }
        }

        return savedNode;
      };

      // Save root first, then children
      await saveNode(tree);

      // Return the updated tree
      const allNodes = await hierarchyRepo.find({
        where: { workspaceId },
        relations: ["user"],
        order: { orderIndex: "ASC" },
      });
      const updatedTree = buildTreeFromDB(allNodes);

      return res.status(200).json(updatedTree);
    } catch (error) {
      console.error("Error saving hierarchy:", error);
      return res.status(500).json({ message: "Failed to save hierarchy" });
    }
  }
}
