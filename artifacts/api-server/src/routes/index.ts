import { Router, type IRouter } from "express";
import healthRouter    from "./health";
import meshyRouter     from "./meshy";
import charactersRouter from "./characters";
import weaponsRouter   from "./weapons";

const router: IRouter = Router();

router.use(healthRouter);
router.use(meshyRouter);
router.use(charactersRouter);
router.use(weaponsRouter);

export default router;
