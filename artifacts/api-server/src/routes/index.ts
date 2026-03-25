import { Router, type IRouter } from "express";
import healthRouter from "./health";
import meshyRouter from "./meshy";
import charactersRouter from "./characters";

const router: IRouter = Router();

router.use(healthRouter);
router.use(meshyRouter);
router.use(charactersRouter);

export default router;
