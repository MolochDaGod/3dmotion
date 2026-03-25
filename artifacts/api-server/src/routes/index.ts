import { Router, type IRouter } from "express";
import healthRouter from "./health";
import meshyRouter from "./meshy";

const router: IRouter = Router();

router.use(healthRouter);
router.use(meshyRouter);

export default router;
