/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19-11.8.6-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: localhost    Database: workflow
-- ------------------------------------------------------
-- Server version	11.8.6-MariaDB-0+deb13u1 from Debian

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*M!100616 SET @OLD_NOTE_VERBOSITY=@@NOTE_VERBOSITY, NOTE_VERBOSITY=0 */;

--
-- Current Database: `workflow`
--

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `workflow` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci */;

USE `workflow`;

--
-- Table structure for table `act_evt_log`
--

DROP TABLE IF EXISTS `act_evt_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_evt_log` (
  `LOG_NR_` bigint(20) NOT NULL AUTO_INCREMENT,
  `TYPE_` varchar(64) DEFAULT NULL,
  `PROC_DEF_ID_` varchar(64) DEFAULT NULL,
  `PROC_INST_ID_` varchar(64) DEFAULT NULL,
  `EXECUTION_ID_` varchar(64) DEFAULT NULL,
  `TASK_ID_` varchar(64) DEFAULT NULL,
  `TIME_STAMP_` timestamp(3) NOT NULL DEFAULT current_timestamp(3),
  `USER_ID_` varchar(255) DEFAULT NULL,
  `DATA_` longblob DEFAULT NULL,
  `LOCK_OWNER_` varchar(255) DEFAULT NULL,
  `LOCK_TIME_` timestamp(3) NULL DEFAULT NULL,
  `IS_PROCESSED_` tinyint(4) DEFAULT 0,
  PRIMARY KEY (`LOG_NR_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_evt_log`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_evt_log` WRITE;
/*!40000 ALTER TABLE `act_evt_log` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_evt_log` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_ge_bytearray`
--

DROP TABLE IF EXISTS `act_ge_bytearray`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_ge_bytearray` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `NAME_` varchar(255) DEFAULT NULL,
  `DEPLOYMENT_ID_` varchar(64) DEFAULT NULL,
  `BYTES_` longblob DEFAULT NULL,
  `GENERATED_` tinyint(4) DEFAULT NULL,
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_BYTEAR_DEPL` (`DEPLOYMENT_ID_`),
  CONSTRAINT `ACT_FK_BYTEARR_DEPL` FOREIGN KEY (`DEPLOYMENT_ID_`) REFERENCES `act_re_deployment` (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_ge_bytearray`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_ge_bytearray` WRITE;
/*!40000 ALTER TABLE `act_ge_bytearray` DISABLE KEYS */;
INSERT INTO `act_ge_bytearray` VALUES
('e00400f8-c58f-11f1-92ce-b6a8b1076472',NULL,'leave_approval_demo.bpmn20.xml','e00400f7-c58f-11f1-92ce-b6a8b1076472','<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<bpmn:definitions xmlns:bpmn=\"http://www.omg.org/spec/BPMN/20100524/MODEL\"\n                  xmlns:flowable=\"http://flowable.org/bpmn\"\n                  xmlns:bpmndi=\"http://www.omg.org/spec/BPMN/20100524/DI\"\n                  xmlns:dc=\"http://www.omg.org/spec/DD/20100524/DC\"\n                  xmlns:di=\"http://www.omg.org/spec/DD/20100524/DI\"\n                  targetNamespace=\"http://workflow.local/demo\">\n  <bpmn:process id=\"leave_approval_demo\" name=\"ËØ∑ÂÅáÂÆ°Êâπ-ÈÄªËæëÊµÅÊºîÁ§∫\" isExecutable=\"true\">\n    <bpmn:startEvent id=\"start_1\" name=\"Êèê‰∫§ËØ∑ÂÅáÁî≥ËØ∑\" />\n    <bpmn:sequenceFlow id=\"flow_0\" sourceRef=\"start_1\" targetRef=\"apply_1\" />\n    <bpmn:userTask id=\"apply_1\" name=\"Êèê‰∫§ËØ∑ÂÅáÁî≥ËØ∑\" flowable:assignee=\"${initiator}\" />\n    <bpmn:sequenceFlow id=\"flow_1\" sourceRef=\"apply_1\" targetRef=\"approve_1\" />\n    <bpmn:userTask id=\"approve_1\" name=\"‰∏ªÁÆ°ÂÆ°Êâπ\" flowable:assignee=\"1\" />\n    <!-- assignee Áî® userIdÔºàÂπ≥Âè∞ÂæÖÂäûÊåâ user.id Êü•ËØ¢ÔºâÔºå1=adminÔºõÂèëËµ∑ËäÇÁÇπ apply_1 ‰∏∫Á¨¨‰∏Ä‰∏™ UserTaskÔºàÂêØÂä®Êó∂Ëá™Âä®ÂÆåÊàêÔºâ -->\n    <bpmn:sequenceFlow id=\"flow_2\" sourceRef=\"approve_1\" targetRef=\"end_1\" />\n    <bpmn:endEvent id=\"end_1\" name=\"ÂÆ°ÊâπÂÆåÊàê\" />\n  </bpmn:process>\n  <bpmndi:BPMNDiagram id=\"Diagram_1\">\n    <bpmndi:BPMNPlane id=\"Plane_1\" bpmnElement=\"leave_approval_demo\">\n      <bpmndi:BPMNShape id=\"start_1_di\" bpmnElement=\"start_1\">\n        <dc:Bounds x=\"160\" y=\"180\" width=\"36\" height=\"36\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"apply_1_di\" bpmnElement=\"apply_1\">\n        <dc:Bounds x=\"250\" y=\"158\" width=\"110\" height=\"80\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"approve_1_di\" bpmnElement=\"approve_1\">\n        <dc:Bounds x=\"430\" y=\"158\" width=\"110\" height=\"80\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"end_1_di\" bpmnElement=\"end_1\">\n        <dc:Bounds x=\"610\" y=\"180\" width=\"36\" height=\"36\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNEdge id=\"flow_0_di\" bpmnElement=\"flow_0\">\n        <di:waypoint x=\"196\" y=\"198\" />\n        <di:waypoint x=\"250\" y=\"198\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"flow_1_di\" bpmnElement=\"flow_1\">\n        <di:waypoint x=\"360\" y=\"198\" />\n        <di:waypoint x=\"430\" y=\"198\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"flow_2_di\" bpmnElement=\"flow_2\">\n        <di:waypoint x=\"540\" y=\"198\" />\n        <di:waypoint x=\"610\" y=\"198\" />\n      </bpmndi:BPMNEdge>\n    </bpmndi:BPMNPlane>\n  </bpmndi:BPMNDiagram>\n</bpmn:definitions>\n',0),
('e00dc4f9-c58f-11f1-92ce-b6a8b1076472',NULL,'leave_approval_demo.leave_approval_demo.png','e00400f7-c58f-11f1-92ce-b6a8b1076472','âPNG\r\n\Z\n\0\0\0\rIHDR\0\0ê\0\0\0¯\0\0\0[ç÷N\0\0ÔIDATx^Ì›	¥UeŸ\0‡ÃÊ’`¶Õ6ÿds´Ÿ&\Z¥Ï∑¥Z¿e”2\n°“\nÃÊV©®`Y*§ï&≠–,â2Q©√R\'d¯ôb2¿¸sˇ˚››}◊aü}Òw8ﬂÂy÷z◊Ωgü}ˆ˛Ó=Ô>Ôwæ==‚\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0@/À≤Ï1w›u◊≈◊]w›øÊŒùõ]u’U¢E#Z∞`¡äyÛÊY}˘˘úN»gÄÑÂ≈ˆí¸C<[µjU∂uÎ÷ÏÅ-\ZÒ˛ƒ˚4˛¸çy>º˙^\"üS\n˘ê∞©âÒÍáªh›XπrÂ⁄º‡ﬁP}/ëœ)Ü|HPÏÊ3RìVƒ˚ï‹m’˜˘úb»gÄ≈±H’t—˙Ô[ıΩD>ß\ZÚ 1]-∏˜oXô›u„yŸí´O)\"~èi’˘DÔÑÇ[O>ßÚ 1])∏õ◊/œ˛zÂó≤õ}‚v”‚πÍ¸¢ÁC¡≠\'ü”˘êòÆ‹˚ñÃi*∂e,[rY”¸¢ÁC¡≠\'ü”˘êòÆ‹ø]Û≠¶B[F<Wù_Ù|(∏ı‰sö!ü”ïÇ˚◊´¶4⁄2‚πÍ¸¢ÁC¡≠\'ü”˘ê7ÕPpÎ…Á4C>$¶+7ŒR≠⁄2‚πÍ¸¢ÁC¡≠\'ü”˘êòÆ‹;Æ=≥©–ñœUÁ=\nn=˘úf»gÄƒt•‡Æ[æ8˚Î•©ÿ∆¥xÆ:øË˘PpÎ…Á4C>$¶+7‚ÓE3õ\nnL´Œ\'z\'‹zÚ9Õêœ\0âÈR¡›∂-ª„è”õ\nnLãÁöÊ=\nn=˘úf»gÄƒ<\\¡ç;s‹~Ì¥¶b[F<ÁÓΩ\nn=˘úf»gÄƒtZp∑mÀVﬁ1/ªÂ∑_l*≤’àyb^£7Ω\nn=˘úf»gÄƒ‘‹á•È,åﬁÙ^(∏ı‰sö!üSWpª2J”Yƒk´À›\nn=˘úf»gÄƒ‘‹j›Ÿ®.Ot(∏ı‰sö!üSWpEÎáÇ[O>ßÚπ{å=zü!CÜlkk;#ˇ97èªÛÿíG÷˛3œm~`Ã_]Ïq6n‹∏Ôú9sN9ÛÃ3oû:uÍ⁄…ì\'o=ˆÿcä\rg¸¯ÒNú8q”I\'ù¥ÙîSNπÏƒO<,…^’eÏâ‹4C¡≠\'ü”˘º{Üzh^ÎfÁÒ@{g±´Ûœé◊Wó	˝ﬁı◊_?˛¥”N[>n‹∏,Ô4fó\\rIˆß?˝)ªÛŒ;≥uÎ÷e!~∆„òœOö4È°1c∆<êw$Ø6lÿÅ’eÓI‹4C¡≠\'ü”˘ºkÚéﬂ¡ypaM«pWba,Ø∫Ëw/^¸_gü}ˆäcé9&ªÙ“K≥5k÷ù≈Æä˘„uyGÚ_&L∏8ﬂpˆ´ÆcO†‡¶\nn=˘úf»Áù3zÙË«µµµùïw˙äΩlçÒôœ|&ª¬w8êœ«|’◊∆Úbπ±¸Í:!y˘v∞˜W\\1\':é\\pA∂yÛÊÌ{Ü;)^À…7ò-#Få¯Hu}˝ùÇõf(∏ı‰sö!üª.Ô‰0tË–õ;~√Ü\rÀŒ9ÁúlŸ≤e’∑C1º.^_ÈHﬁÎ©ÆíïÁ˚>≥fÕ∫˝∏„éÀÓ∫ÎÆÍ∂∞[byyßtÎò1c¶V◊€ü)∏iÜÇ[O>ßÚπkÚé„Ay,oÏÏ}Î[ﬂ ÓªÔæjI€)Ò˙XN•y_¨Ø⁄HNû„˚úq∆ÎO>˘‰l˝˙ı’¸Ô±‹…ì\'o5j‘ÃÍ˙˚+7ÕPpÎ…Á4C>?ºˆë«éŒcå\ZŒô3ßZ∆vK,Ø2\ZyüëHíñÁıﬁ≥fÕ∫#:èÒa”ìb˘\'N‹0|¯ì™ÌËè‹4C¡≠\'ü”˘ºcqLb„nÎ£é:*˚À_˛R-_›\"ñÀoËDﬁ‰òHí«<¸Ò=6ÚXÎ;vÏ¶|√9¢⁄ñ˛F¡M3‹zÚ9Õêœ;÷~¬L«»cOuK±¸∆ë»XµM–ÚÚD><NòÈÓcN¨oƒàÎ\r\Z¥µM˝âÇõf(∏ı‰sö!ü;◊~©ûóùπÀ.ª¨ZÆzD¨ßaÚﬂ.ÒCr‚R=qñt_ò>}˙ä|√9Ω⁄¶˛D¡M3‹zÚ9Õêœù“pù«8—•7UN¨YXm¥¨∏Hxå>n⁄¥©ö◊Ω\"÷;r‰»ç˝˘b„\nnö°‡÷ìœiÜ|Æ7x‡C \\ÏRﬁ›≥≠wV¨ØqWv¥ß⁄FhIqáôŸ≥gWs∫WÕú9ÛŒ|√9ß⁄∂˛B¡M3‹zÚ9ÕêœıÜ¸ÁˆÑEÁ-Æ◊ÿbΩ\r£ê≥´mÑñ≥i”¶ßç?>[Ωzu5ü{Uæ˛ˇÀøÅ≠ö2e #´mÏ‹4C¡≠\'ü”˘‹,Ø;O“poÎﬁ},≈z:êDª™mÖñr˘ÂóOç{[∑Ç±c«ﬁìo8o´∂±ïÂÌΩ&èwWßW)∏i∆ûVpÂsˇ˘‹,~`Ÿqã€ˆ• mV€\n-e⁄¥i∑\\r…%’<Ó3fÃà€:}≥⁄∆V÷∞±ÔÉJ¡M3ˆ¿Ç+ü˚q»Áf˘ÙiÂ|?˘…O™e©W≈˙⁄<≠⁄Vh)SßN]7}o,X‹÷÷6ß⁄∆V÷∞±ÔÉJ¡M3ˆ‡Ç+ü˚a»ÁÊ|:tËºÚ˘EãUÀRØäıómâv5∂ZŒ§Iì∂ˆˆµ;s€m∑≈.Ï´mle5PµT\nnö°‡ Á˛Úπ9üÛüKÀÈ}]c˝\rm\\Z˘s†µå?˛°¸„’<ÓÎ÷≠€úo4À´mle5L’(>®‹4C¡m\n˘úp»Á¶à|˛g˘∏Øka¨ølÀ–°C7Uˇh)#GéÃ|¡j˜âºq[√Íﬁ/¢ß\nÓ˝˜ﬂü˝˘œŒ∂m€÷Ù‹é‚á?¸aå¯6M/#ñ∑b≈ä¶Èø˙’Ø≤õn∫©izD¥•:Ì·‚¯CˆÎ_ˇ∫izª“éÓåÍ˚(˛=ïœª\Z[∂l…>ˇ˘œ∏˙‹é\"Œ|›∞aC”Ù∆8˝Ù”≥˘ÛÁ7MoåXláÒsÒ‚≈≈-Íb˙’W_ù≠\\π≤i˛æäÍ˚(∂èæÆÖ±˛Üˆ¸_µ^CK7n‹É}˝≠´¥fÕöˇ“F Ø“ª¸Óæ˚ÓQ(:oøˇ˝Ô≥◊ºÊ5€E\\ﬂ≥˙öà∂∂∂ÏÄË¥˘µØ}-{Î[ﬂZƒ(û—·åx’´^}Ôx|›u◊uºÊü¯Dˆ•/})õ8qbG¸Úóø,\n¥i”≤n∏°i=_¸‚≥Å6Mﬂùvtg±È›|ﬁ’XµjUˆÍWø:{˚€ﬂû≠]ª∂È˘àòæˇ˛˚g?˚Ÿœ≤?˛Òè≈Òf/{ŸÀ≤N8°∏ù\\ƒµ◊^õ›~˚Ìq<vG|‡»ˆﬁ{ÔÏ?¯¡v”ó,Y“±Ï∏Z˛o):ã«w\\v‘QG”üı¨geW^yeS[˙*‰ss>«H_9ΩØk°HíÚπœ}nS_˜Q∫ı÷[\rIˇ»Ì\nm©ß\nÓÚÂÀ≥G>Úë≈ÔsÁŒÕ^ÒäW#!Ô|Á;≥/º∞xÓø¯EˆÌo;˚Ówø[D‹:+oV1O9Ì;ﬂ˘N6k÷¨b˛(àœ}Ós≥©Sßfqñ~åÓDº‰%/…?¸‚˜∏¸”W\\——ñæÖEq~Ïcõ˝Ùß?Õˆ›wﬂ‚‚∏±‹∑ºÂ-Ÿ©ßûö˝ÓwøÀ>˙—èù∆ËƒF—˛Ûü_¸”‚π9sÊt,sW⁄—ù°‡ˆn>ÔL¨[∑Æ¡é/&—Qãéﬁß?˝Èéi—!\\∂lY1|¡â/Uè¸„ãº€€ﬁV‰Ë{ﬂ˚ﬁb˙‘ß>U‰\\7ÚÎ√˛pëg˘üúΩÔ}ÔÎòyπZ∂e„∆ç≈<—¶¸3µXFLèmbﬁºyMmÔ´êœÕ˘<ƒ1ê∞kN>˘‰˚ZÂ,Ï´Øæzn¬ga7}05ÍâÇE*\n·^{ÌïΩ˚›ÔŒŒ>˚Ï¢ Êﬂ\\ãxˆ≥üù]|Ò≈≈ºÁùw^6i“§\"ÚÊméŒ◊Ò«_<ée≈sgûyf«Úc˜[t„˜πyﬁÛûWﬂß=Ìi≈Ô/z—ã:ÊçøÔ†É*>\0Ûò«£9˚Ì∑_±˛Ö<‰êCädt,£8ˇÊ7ø)b‘®QŸ{ﬁÛûé«o~Ûõ≥”N;mªøsg⁄—›±‹^œÁùçoº1{Â+_ôΩ˛ıØ/\":áy”≤◊ΩÓu”b§:F·\'LòP<éŒ‰E]îvÿa≈ºﬂ¯∆7ä—˚è¸„Eé∆rc[àm£\\œ?ˇ˘œbﬁ;Ó∏£cZ‰hŸÅå«ÛºÎ]Ô*FAÀ‰ÅX|±ãNe|ŒVˇÜﬁ˘‹ÃYÿ∞ã¶LôrY´\\2Ô`ƒÌ§RªdßLçz¢‡Fg->pb‘%vª≈»›3ü˘ÃéQ∫ËXÕú9≥c˛≠[∑f„∆ç+:aÒ⁄ò#òQ¢S◊∏;˚«?˛q±k8éOå›»Â.Èø¯≈EÒ-«Ë_‹À<Fd¢h∆.ıhO<˜⁄◊æ∂ÿ}]ÿËúF2÷◊àÿ=ªÀ«/x¡∂Î@ÓL;™ˇüÓà=∞‡ˆY>ÔnD.?¢}∞˙\\l\'—Åå/(Ò{Ã#ÑÂ¥»√Ø|Â+ŸÕ7ﬂ\\åú«õ2bﬁÿN «1b_í9Î≠∑Ûƒqπ«{lv¡g_˝ÍW≥\'?˘…≈Ôœx∆3äy™ÌÍÌêœÕÜ∏$Ïöº~`“§IUπ<8lÿ∞≈CªMWıT¡-waG«0FÍæ˘Õon1˙«~≈s±À.FDbî§ôå„\n˜Ÿgü¢3EÓŒ;Ô,¶«.„#è<≤(ñ?ˇ˘œ≥¸Ω…‰ù¿ÈåàÈ\'ùtR—¡ã›œèz‘£ä‰=˜‹S¸£çÁû{nv˛˘ÁggúqFÒ\\t c‘p˙ÙÈEqƒ≈ÓÌÚqtD;ê]mGå∞Vˇ7›{Z¡Ì™û Áùç8Ê0:pKó.-:oy”≤øˇ˝Ô≈„ò€GÃù∑ß?˝È≈≠8Óˆ¨≥Œ æ˜ΩÔe_ˇ˙◊≥/˘ÀEûFß0é´ç˘#Oc$≥<$ñ˚€ﬂ˛∂¯˝˝Ô1oc; ]ÿü¸‰\'ãQıËê∆Ò¿Oz“ìäŒjg«\Z˜v»ÁfCZËN4\'úp¬C\rHw¢°µ≈Ωß«é˚@_ﬂ{Ÿ≤e◊ÊÃJ˜¬ÓZƒhbÏ~ãŒ`Ï¬éb¯éwº£ËP≈Æ‰Âãﬂ„˘82:gQ(◊Ø__t– W‚x±yá,Œvæ‡Ç∂;õ;F˛bÒ˚°áö\r\Z4®£c¯Úóøº81&Êèëñ/|·€u Àa¥#vF\'7vFaé—√Ú§Ö#F¡ÚÒõﬁÙ¶¶]ÿ]iGıˇ”]°‡÷ÎÓ|ﬁ’àŒ`|Òâ√5bÙ=oZq‚J<éÈ1˙ÛE/éóå›ﬁ—ë,ôàà—˙~ÉŸΩ˜ﬁ€qbL‰iäÀâàÂñÎâ√\' dú‹€·Äˆ]ÿ±\r}ˆ≥ü›n∂c [õ{a√n8ÒƒØå„Ñ˙Rﬁ	π(ﬂhŒ©∂≠øËâÇù∂ÿ’ªå„qÏ çêrd/vÂ≈ÉÍÎ¢#˜‘ß>µ}åüó^zi”<e«-:vq|X”£áÂ1àç∑¯=äf·Ë–F«5F<c$Ê\roxC1öÛEaéu∆Òcq“Oú\r^>é\"›Y≤+ÌËÓPpÎıD>ÔnÏhv±+˚—è~ÙvW*xÈK_Zål7Œy\ZπÀ,ó«0∆Ô1\"ﬁ8ùÿe/◊€aµÕj[˙\"‰sΩºˆƒ·SEÁ->S˚B¨∑°9ª⁄FhI˘áÁÅc∆å˘WÀ÷÷Ø_Cæ¡¨évT€÷_ÙT¡çÇVv „Ñö8ì4:ê—Iã]gqr@ı5q<aú-\'€Tü+#:n1Z«)∆≤?Ù°mwtg»XnÏBå„,„∏Ã¸œ/v∆|—yçë†ÚuS¶LŸÆ\r1BTüπ+ÌËÓPpÎıT>ÔNt•ù¿\'>Òâ≈ev™±fÕöé˘¢y\\~QâÂ>Á9œ)~¬û–È.Ï∆‰-∑‹“—Åå/?Ò•Æ⁄ûﬁ˘\\o‡¡áîù∑¯2—€£ê±æ¸s∞c˜u¥ß⁄FhY&L∏8vøÙÖ|›?œ7ö”´mÍOz™‡ñ»ø˝Ìo≈Æ„Ë8∆`„%F™«EFÁÚ)OyJˆ∆7æ±„¢«’à„ctªéÛ/≈±ÜÒ˙Œ:ê±ÎoÛÊÕŸè~Ù£bD1F#£.\\∏∞iq“B|`VßÔj;∫;‹z=ïœ;1ÍW(óàN]ﬁ¥‚ƒ≠rZ<?c∆åé◊ƒ1åëìqÕ‘¯\"ó˙âëÏ¯“SŒw˝ı◊«óècπÂõX^ı⁄é’À¯ƒ…`—yå]ﬁÒøäQıºS–Ù7Ùv»ÁŒÂüCÀ\\\\Ê¨7≈˙\ZFV€-m–†A˚è=zKo_k—¢E±Îzu¨ø⁄¶˛§\'\nnú¿™8ˆ+v«Ÿüq÷u»eâ›s1=NDπ¸ÚÀ≥·√ágù∆»Jπ82é◊ä_Ã«C6v∆‚‚Ãeßo¿Ä≈s±+.Æá\'ƒ2Àyøˇ˝ÔgG}tqíB˛Áù”∏ƒJú·œ«Hct0´wÃâQƒè}ÏcM[cÏL;∫;‹z=ëœ;qlmå∞WG#ˇLÀé9Êòé◊DEæ7ûa_¬\Z;êç_ÜÚ?π”a‚ãwúÑáVD~«:„åÓ¯2\'∑≈ˆœ5vH˚*‰sÁÜzp^ã˛]v‰b‘∏7ƒz\Z:èˇévT€-oƒà…?∂F«¢7¨^Ω˙w˘soGT€“ﬂÙD¡çQ«8Ä?FPN9Âî‚r:1Ωº≠Zt¨‚¬»qvÍ5◊\\Súa\Z£3’B◊∑ããå«Û1jX]ODÏÜã≥[„˜∏hw„nËà∏@x\\¨<\nhå¬ƒ∞’e‘EÏ6¨ªUagÒpÌËÓPpÎıD>˜Fƒà}\\*•:=vm«ı´”#b{ä]⁄ùÌ\ZèéeúÕóˇâ«1Rﬁ∏ç≈â9±=∆ÁjıµΩÚy«⁄⁄⁄Œ*;s±\'\'ˆŒÙ§X~„ÆÎXµMêå1c∆Lù<yÚñ¯∞ÈIyG„÷|Ω1ﬂxæPmCîj¡›”C¡≠\'ü”˘ºc£Gè~\\ﬁëª©Ï–≈(vOu\"cπ˘˙:F<cΩ±˛jõ )£Fçö9q‚ƒ\r=5πzıÍ˘—yÃ7òs´ÎÓØ‹4C¡≠\'ü”˘¸Ú∫t@˜5éD∆…Ä›)ñ◊8Úÿææ™mÅ$\r>¸§1c∆t˚}≤€èy\\∫ßå<ñ‹4C¡≠\'ü”˘‹5y}:®±\'∫ÏÓŸŸÒ˙ 	3EÁ1÷Wm$-OÏ#Få±~˙ÙÈ+‚@Ú›±a√ÜÎ€œ∂^À≠Æ´øSp”∑û|N3‰s◊≈à‡êÜ›Ÿ1\Z◊kåÀëÌåò?^Wu,v[«z™ÎÜ~!O¯˝Ú?}‰»ëœ?ˇ¸;◊¨YÛ`u„ÿÅó/_~Ì‘©Sã3≠c9±ºÍ:ˆ\nnö°‡÷ìœiÜ|ﬁ9qLb˚â5’é_q€√∏ÀWúÄ\'N≈IV!~∆„òœWnOX∆C±\\«<≤Gàã|ÁINﬁ\\}Ù—Gﬂ;c∆åø,X∞`Òm∑›∂tÌ⁄µ˜Á€ÕÊ’´Wﬂµd…íE˘á‘UßûzÍÏˆ{[ˇoºÆ?_$º+‹4C¡≠\'ü”˘ºk⁄/Ò”qù»›åÖ.’√ûjØ¡Éø=ﬂ\0æëÉöìoqôÚXë¯yCLèÁcæòø∫Ä=ëÇõf(∏ı‰sö!üwO^◊Úü€v‹;ªãÛœé◊Wó	∞C\nnö°‡÷ìœiÜ|Ó£Gèﬁ\'Ôlkk;#ˇ97èªÛÿ“ﬁYåüÒxn˚Ûc˛Í2\0∫D¡M3‹zÚ9Õêœ\0âQp”∑û|N3‰3@b‹4C¡≠\'ü”˘ê7ÕPpÎ…Á4C>$F¡M3‹zÚ9Õêœ\0âQp”∑û|N3‰3@b‹4C¡≠\'ü”˘ê7ÕPpÎ…Á4C>$F¡M3‹zÚ9Õêœ\0âQp”∑û|N3‰3@b‹4C¡≠\'ü”˘ê7ÕPpÎ…Á4C>$F¡M3‹zÚ9Õêœ\0âQp”∑û|N3‰3@b‹4C¡≠\'ü”˘ê7ÕPpÎ…Á4C>$F¡M3‹zÚ9Õêœ\0âô;wÓC[∑nm˙@≠˘˚µ\"/∏€™Ô%Ú9≈êœ\0	Z∞`¡äU´V5}®ã÷ç{ÔΩ˜gy¡Ω°˙^\"üS˘ê†yÛÊ9˛¸ç+WÆ\\k‰¶µ#Vﬁsœ=Â≈viáWﬂK‰sJ!üﬁ1ê«q,íhŸà˜\'ﬁ\'≈v‚ˇ”˛íœ≠Ú\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0†∑¸?é⁄ÒPV=∆Ò\0\0\0\0IENDÆB`Ç',1);
/*!40000 ALTER TABLE `act_ge_bytearray` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_ge_property`
--

DROP TABLE IF EXISTS `act_ge_property`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_ge_property` (
  `NAME_` varchar(64) NOT NULL,
  `VALUE_` varchar(300) DEFAULT NULL,
  `REV_` int(11) DEFAULT NULL,
  PRIMARY KEY (`NAME_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_ge_property`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_ge_property` WRITE;
/*!40000 ALTER TABLE `act_ge_property` DISABLE KEYS */;
INSERT INTO `act_ge_property` VALUES
('cfg.execution-related-entities-count','true',1),
('cfg.task-related-entities-count','true',1),
('common.schema.version','8.0.0.0',1),
('eventregistry.schema.version','8.0.0.0',1),
('next.dbid','1',1),
('schema.history','create(8.0.0.0)',1),
('schema.version','8.0.0.0',1);
/*!40000 ALTER TABLE `act_ge_property` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_hi_actinst`
--

DROP TABLE IF EXISTS `act_hi_actinst`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_hi_actinst` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT 1,
  `PROC_DEF_ID_` varchar(64) NOT NULL,
  `PROC_INST_ID_` varchar(64) NOT NULL,
  `EXECUTION_ID_` varchar(64) NOT NULL,
  `ACT_ID_` varchar(255) NOT NULL,
  `TASK_ID_` varchar(64) DEFAULT NULL,
  `CALL_PROC_INST_ID_` varchar(64) DEFAULT NULL,
  `ACT_NAME_` varchar(255) DEFAULT NULL,
  `ACT_TYPE_` varchar(255) NOT NULL,
  `ASSIGNEE_` varchar(255) DEFAULT NULL,
  `COMPLETED_BY_` varchar(255) DEFAULT NULL,
  `START_TIME_` datetime(3) NOT NULL,
  `END_TIME_` datetime(3) DEFAULT NULL,
  `TRANSACTION_ORDER_` int(11) DEFAULT NULL,
  `DURATION_` bigint(20) DEFAULT NULL,
  `DELETE_REASON_` varchar(4000) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_HI_ACT_INST_START` (`START_TIME_`),
  KEY `ACT_IDX_HI_ACT_INST_END` (`END_TIME_`),
  KEY `ACT_IDX_HI_ACT_INST_PROCINST` (`PROC_INST_ID_`,`ACT_ID_`),
  KEY `ACT_IDX_HI_ACT_INST_EXEC` (`EXECUTION_ID_`,`ACT_ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_hi_actinst`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_hi_actinst` WRITE;
/*!40000 ALTER TABLE `act_hi_actinst` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_hi_actinst` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_hi_attachment`
--

DROP TABLE IF EXISTS `act_hi_attachment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_hi_attachment` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `USER_ID_` varchar(255) DEFAULT NULL,
  `NAME_` varchar(255) DEFAULT NULL,
  `DESCRIPTION_` varchar(4000) DEFAULT NULL,
  `TYPE_` varchar(255) DEFAULT NULL,
  `TASK_ID_` varchar(64) DEFAULT NULL,
  `PROC_INST_ID_` varchar(64) DEFAULT NULL,
  `URL_` varchar(4000) DEFAULT NULL,
  `CONTENT_ID_` varchar(64) DEFAULT NULL,
  `TIME_` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_hi_attachment`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_hi_attachment` WRITE;
/*!40000 ALTER TABLE `act_hi_attachment` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_hi_attachment` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_hi_comment`
--

DROP TABLE IF EXISTS `act_hi_comment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_hi_comment` (
  `ID_` varchar(64) NOT NULL,
  `TYPE_` varchar(255) DEFAULT NULL,
  `TIME_` datetime(3) NOT NULL,
  `USER_ID_` varchar(255) DEFAULT NULL,
  `TASK_ID_` varchar(64) DEFAULT NULL,
  `PROC_INST_ID_` varchar(64) DEFAULT NULL,
  `ACTION_` varchar(255) DEFAULT NULL,
  `MESSAGE_` varchar(4000) DEFAULT NULL,
  `FULL_MSG_` longblob DEFAULT NULL,
  PRIMARY KEY (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_hi_comment`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_hi_comment` WRITE;
/*!40000 ALTER TABLE `act_hi_comment` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_hi_comment` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_hi_detail`
--

DROP TABLE IF EXISTS `act_hi_detail`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_hi_detail` (
  `ID_` varchar(64) NOT NULL,
  `TYPE_` varchar(255) NOT NULL,
  `PROC_INST_ID_` varchar(64) DEFAULT NULL,
  `EXECUTION_ID_` varchar(64) DEFAULT NULL,
  `TASK_ID_` varchar(64) DEFAULT NULL,
  `ACT_INST_ID_` varchar(64) DEFAULT NULL,
  `NAME_` varchar(255) NOT NULL,
  `VAR_TYPE_` varchar(255) DEFAULT NULL,
  `REV_` int(11) DEFAULT NULL,
  `TIME_` datetime(3) NOT NULL,
  `BYTEARRAY_ID_` varchar(64) DEFAULT NULL,
  `DOUBLE_` double DEFAULT NULL,
  `LONG_` bigint(20) DEFAULT NULL,
  `TEXT_` varchar(4000) DEFAULT NULL,
  `TEXT2_` varchar(4000) DEFAULT NULL,
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_HI_DETAIL_PROC_INST` (`PROC_INST_ID_`),
  KEY `ACT_IDX_HI_DETAIL_ACT_INST` (`ACT_INST_ID_`),
  KEY `ACT_IDX_HI_DETAIL_TIME` (`TIME_`),
  KEY `ACT_IDX_HI_DETAIL_NAME` (`NAME_`),
  KEY `ACT_IDX_HI_DETAIL_TASK_ID` (`TASK_ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_hi_detail`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_hi_detail` WRITE;
/*!40000 ALTER TABLE `act_hi_detail` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_hi_detail` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_hi_entitylink`
--

DROP TABLE IF EXISTS `act_hi_entitylink`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_hi_entitylink` (
  `ID_` varchar(64) NOT NULL,
  `LINK_TYPE_` varchar(255) DEFAULT NULL,
  `CREATE_TIME_` datetime(3) DEFAULT NULL,
  `SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SUB_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `SCOPE_DEFINITION_ID_` varchar(255) DEFAULT NULL,
  `PARENT_ELEMENT_ID_` varchar(255) DEFAULT NULL,
  `REF_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `REF_SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `REF_SCOPE_DEFINITION_ID_` varchar(255) DEFAULT NULL,
  `ROOT_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `ROOT_SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `HIERARCHY_TYPE_` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_HI_ENT_LNK_SCOPE` (`SCOPE_ID_`,`SCOPE_TYPE_`,`LINK_TYPE_`),
  KEY `ACT_IDX_HI_ENT_LNK_REF_SCOPE` (`REF_SCOPE_ID_`,`REF_SCOPE_TYPE_`,`LINK_TYPE_`),
  KEY `ACT_IDX_HI_ENT_LNK_ROOT_SCOPE` (`ROOT_SCOPE_ID_`,`ROOT_SCOPE_TYPE_`,`LINK_TYPE_`),
  KEY `ACT_IDX_HI_ENT_LNK_SCOPE_DEF` (`SCOPE_DEFINITION_ID_`,`SCOPE_TYPE_`,`LINK_TYPE_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_hi_entitylink`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_hi_entitylink` WRITE;
/*!40000 ALTER TABLE `act_hi_entitylink` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_hi_entitylink` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_hi_identitylink`
--

DROP TABLE IF EXISTS `act_hi_identitylink`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_hi_identitylink` (
  `ID_` varchar(64) NOT NULL,
  `GROUP_ID_` varchar(255) DEFAULT NULL,
  `TYPE_` varchar(255) DEFAULT NULL,
  `USER_ID_` varchar(255) DEFAULT NULL,
  `TASK_ID_` varchar(64) DEFAULT NULL,
  `CREATE_TIME_` datetime(3) DEFAULT NULL,
  `PROC_INST_ID_` varchar(64) DEFAULT NULL,
  `SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SUB_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `SCOPE_DEFINITION_ID_` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_HI_IDENT_LNK_USER` (`USER_ID_`),
  KEY `ACT_IDX_HI_IDENT_LNK_SCOPE` (`SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_HI_IDENT_LNK_SUB_SCOPE` (`SUB_SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_HI_IDENT_LNK_SCOPE_DEF` (`SCOPE_DEFINITION_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_HI_IDENT_LNK_TASK` (`TASK_ID_`),
  KEY `ACT_IDX_HI_IDENT_LNK_PROCINST` (`PROC_INST_ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_hi_identitylink`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_hi_identitylink` WRITE;
/*!40000 ALTER TABLE `act_hi_identitylink` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_hi_identitylink` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_hi_procinst`
--

DROP TABLE IF EXISTS `act_hi_procinst`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_hi_procinst` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT 1,
  `PROC_INST_ID_` varchar(64) NOT NULL,
  `BUSINESS_KEY_` varchar(255) DEFAULT NULL,
  `PROC_DEF_ID_` varchar(64) NOT NULL,
  `START_TIME_` datetime(3) NOT NULL,
  `END_TIME_` datetime(3) DEFAULT NULL,
  `DURATION_` bigint(20) DEFAULT NULL,
  `START_USER_ID_` varchar(255) DEFAULT NULL,
  `START_ACT_ID_` varchar(255) DEFAULT NULL,
  `END_ACT_ID_` varchar(255) DEFAULT NULL,
  `SUPER_PROCESS_INSTANCE_ID_` varchar(64) DEFAULT NULL,
  `DELETE_REASON_` varchar(4000) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  `NAME_` varchar(255) DEFAULT NULL,
  `CALLBACK_ID_` varchar(255) DEFAULT NULL,
  `CALLBACK_TYPE_` varchar(255) DEFAULT NULL,
  `REFERENCE_ID_` varchar(255) DEFAULT NULL,
  `REFERENCE_TYPE_` varchar(255) DEFAULT NULL,
  `PROPAGATED_STAGE_INST_ID_` varchar(255) DEFAULT NULL,
  `BUSINESS_STATUS_` varchar(255) DEFAULT NULL,
  `END_USER_ID_` varchar(255) DEFAULT NULL,
  `STATE_` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ID_`),
  UNIQUE KEY `PROC_INST_ID_` (`PROC_INST_ID_`),
  KEY `ACT_IDX_HI_PRO_INST_END` (`END_TIME_`),
  KEY `ACT_IDX_HI_PRO_I_BUSKEY` (`BUSINESS_KEY_`),
  KEY `ACT_IDX_HI_PRO_SUPER_PROCINST` (`SUPER_PROCESS_INSTANCE_ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_hi_procinst`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_hi_procinst` WRITE;
/*!40000 ALTER TABLE `act_hi_procinst` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_hi_procinst` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_hi_taskinst`
--

DROP TABLE IF EXISTS `act_hi_taskinst`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_hi_taskinst` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT 1,
  `PROC_DEF_ID_` varchar(64) DEFAULT NULL,
  `TASK_DEF_ID_` varchar(64) DEFAULT NULL,
  `TASK_DEF_KEY_` varchar(255) DEFAULT NULL,
  `PROC_INST_ID_` varchar(64) DEFAULT NULL,
  `EXECUTION_ID_` varchar(64) DEFAULT NULL,
  `SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SUB_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `SCOPE_DEFINITION_ID_` varchar(255) DEFAULT NULL,
  `PROPAGATED_STAGE_INST_ID_` varchar(255) DEFAULT NULL,
  `STATE_` varchar(255) DEFAULT NULL,
  `NAME_` varchar(255) DEFAULT NULL,
  `PARENT_TASK_ID_` varchar(64) DEFAULT NULL,
  `DESCRIPTION_` varchar(4000) DEFAULT NULL,
  `OWNER_` varchar(255) DEFAULT NULL,
  `ASSIGNEE_` varchar(255) DEFAULT NULL,
  `START_TIME_` datetime(3) NOT NULL,
  `IN_PROGRESS_TIME_` datetime(3) DEFAULT NULL,
  `IN_PROGRESS_STARTED_BY_` varchar(255) DEFAULT NULL,
  `CLAIM_TIME_` datetime(3) DEFAULT NULL,
  `CLAIMED_BY_` varchar(255) DEFAULT NULL,
  `SUSPENDED_TIME_` datetime(3) DEFAULT NULL,
  `SUSPENDED_BY_` varchar(255) DEFAULT NULL,
  `END_TIME_` datetime(3) DEFAULT NULL,
  `COMPLETED_BY_` varchar(255) DEFAULT NULL,
  `DURATION_` bigint(20) DEFAULT NULL,
  `DELETE_REASON_` varchar(4000) DEFAULT NULL,
  `PRIORITY_` int(11) DEFAULT NULL,
  `IN_PROGRESS_DUE_DATE_` datetime(3) DEFAULT NULL,
  `DUE_DATE_` datetime(3) DEFAULT NULL,
  `FORM_KEY_` varchar(255) DEFAULT NULL,
  `CATEGORY_` varchar(255) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  `LAST_UPDATED_TIME_` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_HI_TASK_SCOPE` (`SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_HI_TASK_SUB_SCOPE` (`SUB_SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_HI_TASK_SCOPE_DEF` (`SCOPE_DEFINITION_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_HI_TASK_INST_PROCINST` (`PROC_INST_ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_hi_taskinst`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_hi_taskinst` WRITE;
/*!40000 ALTER TABLE `act_hi_taskinst` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_hi_taskinst` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_hi_tsk_log`
--

DROP TABLE IF EXISTS `act_hi_tsk_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_hi_tsk_log` (
  `ID_` bigint(20) NOT NULL AUTO_INCREMENT,
  `TYPE_` varchar(64) DEFAULT NULL,
  `TASK_ID_` varchar(64) NOT NULL,
  `TIME_STAMP_` timestamp(3) NOT NULL,
  `USER_ID_` varchar(255) DEFAULT NULL,
  `DATA_` varchar(4000) DEFAULT NULL,
  `EXECUTION_ID_` varchar(64) DEFAULT NULL,
  `PROC_INST_ID_` varchar(64) DEFAULT NULL,
  `PROC_DEF_ID_` varchar(64) DEFAULT NULL,
  `SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SCOPE_DEFINITION_ID_` varchar(255) DEFAULT NULL,
  `SUB_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_ACT_HI_TSK_LOG_TASK` (`TASK_ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_hi_tsk_log`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_hi_tsk_log` WRITE;
/*!40000 ALTER TABLE `act_hi_tsk_log` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_hi_tsk_log` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_hi_varinst`
--

DROP TABLE IF EXISTS `act_hi_varinst`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_hi_varinst` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT 1,
  `PROC_INST_ID_` varchar(64) DEFAULT NULL,
  `EXECUTION_ID_` varchar(64) DEFAULT NULL,
  `TASK_ID_` varchar(64) DEFAULT NULL,
  `NAME_` varchar(255) NOT NULL,
  `VAR_TYPE_` varchar(100) DEFAULT NULL,
  `SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SUB_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `BYTEARRAY_ID_` varchar(64) DEFAULT NULL,
  `DOUBLE_` double DEFAULT NULL,
  `LONG_` bigint(20) DEFAULT NULL,
  `TEXT_` varchar(4000) DEFAULT NULL,
  `TEXT2_` varchar(4000) DEFAULT NULL,
  `META_INFO_` varchar(4000) DEFAULT NULL,
  `CREATE_TIME_` datetime(3) DEFAULT NULL,
  `LAST_UPDATED_TIME_` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_HI_PROCVAR_NAME_TYPE` (`NAME_`,`VAR_TYPE_`),
  KEY `ACT_IDX_HI_VAR_SCOPE_ID_TYPE` (`SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_HI_VAR_SUB_ID_TYPE` (`SUB_SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_HI_PROCVAR_PROC_INST` (`PROC_INST_ID_`),
  KEY `ACT_IDX_HI_PROCVAR_TASK_ID` (`TASK_ID_`),
  KEY `ACT_IDX_HI_PROCVAR_EXE` (`EXECUTION_ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_hi_varinst`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_hi_varinst` WRITE;
/*!40000 ALTER TABLE `act_hi_varinst` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_hi_varinst` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_id_bytearray`
--

DROP TABLE IF EXISTS `act_id_bytearray`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_id_bytearray` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `NAME_` varchar(255) DEFAULT NULL,
  `BYTES_` longblob DEFAULT NULL,
  PRIMARY KEY (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_id_bytearray`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_id_bytearray` WRITE;
/*!40000 ALTER TABLE `act_id_bytearray` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_id_bytearray` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_id_group`
--

DROP TABLE IF EXISTS `act_id_group`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_id_group` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `NAME_` varchar(255) DEFAULT NULL,
  `TYPE_` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_id_group`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_id_group` WRITE;
/*!40000 ALTER TABLE `act_id_group` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_id_group` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_id_info`
--

DROP TABLE IF EXISTS `act_id_info`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_id_info` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `USER_ID_` varchar(64) DEFAULT NULL,
  `TYPE_` varchar(64) DEFAULT NULL,
  `KEY_` varchar(255) DEFAULT NULL,
  `VALUE_` varchar(255) DEFAULT NULL,
  `PASSWORD_` longblob DEFAULT NULL,
  `PARENT_ID_` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_id_info`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_id_info` WRITE;
/*!40000 ALTER TABLE `act_id_info` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_id_info` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_id_membership`
--

DROP TABLE IF EXISTS `act_id_membership`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_id_membership` (
  `USER_ID_` varchar(64) NOT NULL,
  `GROUP_ID_` varchar(64) NOT NULL,
  PRIMARY KEY (`USER_ID_`,`GROUP_ID_`),
  KEY `ACT_FK_MEMB_GROUP` (`GROUP_ID_`),
  CONSTRAINT `ACT_FK_MEMB_GROUP` FOREIGN KEY (`GROUP_ID_`) REFERENCES `act_id_group` (`ID_`),
  CONSTRAINT `ACT_FK_MEMB_USER` FOREIGN KEY (`USER_ID_`) REFERENCES `act_id_user` (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_id_membership`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_id_membership` WRITE;
/*!40000 ALTER TABLE `act_id_membership` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_id_membership` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_id_priv`
--

DROP TABLE IF EXISTS `act_id_priv`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_id_priv` (
  `ID_` varchar(64) NOT NULL,
  `NAME_` varchar(255) NOT NULL,
  PRIMARY KEY (`ID_`),
  UNIQUE KEY `ACT_UNIQ_PRIV_NAME` (`NAME_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_id_priv`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_id_priv` WRITE;
/*!40000 ALTER TABLE `act_id_priv` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_id_priv` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_id_priv_mapping`
--

DROP TABLE IF EXISTS `act_id_priv_mapping`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_id_priv_mapping` (
  `ID_` varchar(64) NOT NULL,
  `PRIV_ID_` varchar(64) NOT NULL,
  `USER_ID_` varchar(255) DEFAULT NULL,
  `GROUP_ID_` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ID_`),
  KEY `ACT_FK_PRIV_MAPPING` (`PRIV_ID_`),
  KEY `ACT_IDX_PRIV_USER` (`USER_ID_`),
  KEY `ACT_IDX_PRIV_GROUP` (`GROUP_ID_`),
  CONSTRAINT `ACT_FK_PRIV_MAPPING` FOREIGN KEY (`PRIV_ID_`) REFERENCES `act_id_priv` (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_id_priv_mapping`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_id_priv_mapping` WRITE;
/*!40000 ALTER TABLE `act_id_priv_mapping` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_id_priv_mapping` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_id_property`
--

DROP TABLE IF EXISTS `act_id_property`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_id_property` (
  `NAME_` varchar(64) NOT NULL,
  `VALUE_` varchar(300) DEFAULT NULL,
  `REV_` int(11) DEFAULT NULL,
  PRIMARY KEY (`NAME_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_id_property`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_id_property` WRITE;
/*!40000 ALTER TABLE `act_id_property` DISABLE KEYS */;
INSERT INTO `act_id_property` VALUES
('schema.version','8.0.0.0',1);
/*!40000 ALTER TABLE `act_id_property` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_id_token`
--

DROP TABLE IF EXISTS `act_id_token`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_id_token` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `TOKEN_VALUE_` varchar(255) DEFAULT NULL,
  `TOKEN_DATE_` timestamp(3) NULL DEFAULT NULL,
  `IP_ADDRESS_` varchar(255) DEFAULT NULL,
  `USER_AGENT_` varchar(255) DEFAULT NULL,
  `USER_ID_` varchar(255) DEFAULT NULL,
  `TOKEN_DATA_` varchar(2000) DEFAULT NULL,
  PRIMARY KEY (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_id_token`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_id_token` WRITE;
/*!40000 ALTER TABLE `act_id_token` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_id_token` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_id_user`
--

DROP TABLE IF EXISTS `act_id_user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_id_user` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `FIRST_` varchar(255) DEFAULT NULL,
  `LAST_` varchar(255) DEFAULT NULL,
  `DISPLAY_NAME_` varchar(255) DEFAULT NULL,
  `EMAIL_` varchar(255) DEFAULT NULL,
  `PWD_` varchar(255) DEFAULT NULL,
  `PICTURE_ID_` varchar(64) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  PRIMARY KEY (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_id_user`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_id_user` WRITE;
/*!40000 ALTER TABLE `act_id_user` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_id_user` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_procdef_info`
--

DROP TABLE IF EXISTS `act_procdef_info`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_procdef_info` (
  `ID_` varchar(64) NOT NULL,
  `PROC_DEF_ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `INFO_JSON_ID_` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`ID_`),
  UNIQUE KEY `ACT_UNIQ_INFO_PROCDEF` (`PROC_DEF_ID_`),
  KEY `ACT_IDX_INFO_PROCDEF` (`PROC_DEF_ID_`),
  KEY `ACT_FK_INFO_JSON_BA` (`INFO_JSON_ID_`),
  CONSTRAINT `ACT_FK_INFO_JSON_BA` FOREIGN KEY (`INFO_JSON_ID_`) REFERENCES `act_ge_bytearray` (`ID_`),
  CONSTRAINT `ACT_FK_INFO_PROCDEF` FOREIGN KEY (`PROC_DEF_ID_`) REFERENCES `act_re_procdef` (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_procdef_info`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_procdef_info` WRITE;
/*!40000 ALTER TABLE `act_procdef_info` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_procdef_info` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_re_deployment`
--

DROP TABLE IF EXISTS `act_re_deployment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_re_deployment` (
  `ID_` varchar(64) NOT NULL,
  `NAME_` varchar(255) DEFAULT NULL,
  `CATEGORY_` varchar(255) DEFAULT NULL,
  `KEY_` varchar(255) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  `DEPLOY_TIME_` timestamp(3) NULL DEFAULT NULL,
  `DERIVED_FROM_` varchar(64) DEFAULT NULL,
  `DERIVED_FROM_ROOT_` varchar(64) DEFAULT NULL,
  `PARENT_DEPLOYMENT_ID_` varchar(255) DEFAULT NULL,
  `ENGINE_VERSION_` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_re_deployment`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_re_deployment` WRITE;
/*!40000 ALTER TABLE `act_re_deployment` DISABLE KEYS */;
INSERT INTO `act_re_deployment` VALUES
('e00400f7-c58f-11f1-92ce-b6a8b1076472','ËØ∑ÂÅáÂÆ°Êâπ-ÈÄªËæëÊµÅÊºîÁ§∫',NULL,NULL,'default','2026-10-11 16:21:55.455',NULL,NULL,'e00400f7-c58f-11f1-92ce-b6a8b1076472',NULL);
/*!40000 ALTER TABLE `act_re_deployment` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_re_model`
--

DROP TABLE IF EXISTS `act_re_model`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_re_model` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `NAME_` varchar(255) DEFAULT NULL,
  `KEY_` varchar(255) DEFAULT NULL,
  `CATEGORY_` varchar(255) DEFAULT NULL,
  `CREATE_TIME_` timestamp(3) NULL DEFAULT NULL,
  `LAST_UPDATE_TIME_` timestamp(3) NULL DEFAULT NULL,
  `VERSION_` int(11) DEFAULT NULL,
  `META_INFO_` varchar(4000) DEFAULT NULL,
  `DEPLOYMENT_ID_` varchar(64) DEFAULT NULL,
  `EDITOR_SOURCE_VALUE_ID_` varchar(64) DEFAULT NULL,
  `EDITOR_SOURCE_EXTRA_VALUE_ID_` varchar(64) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  PRIMARY KEY (`ID_`),
  KEY `ACT_FK_MODEL_SOURCE` (`EDITOR_SOURCE_VALUE_ID_`),
  KEY `ACT_FK_MODEL_SOURCE_EXTRA` (`EDITOR_SOURCE_EXTRA_VALUE_ID_`),
  KEY `ACT_FK_MODEL_DEPLOYMENT` (`DEPLOYMENT_ID_`),
  CONSTRAINT `ACT_FK_MODEL_DEPLOYMENT` FOREIGN KEY (`DEPLOYMENT_ID_`) REFERENCES `act_re_deployment` (`ID_`),
  CONSTRAINT `ACT_FK_MODEL_SOURCE` FOREIGN KEY (`EDITOR_SOURCE_VALUE_ID_`) REFERENCES `act_ge_bytearray` (`ID_`),
  CONSTRAINT `ACT_FK_MODEL_SOURCE_EXTRA` FOREIGN KEY (`EDITOR_SOURCE_EXTRA_VALUE_ID_`) REFERENCES `act_ge_bytearray` (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_re_model`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_re_model` WRITE;
/*!40000 ALTER TABLE `act_re_model` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_re_model` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_re_procdef`
--

DROP TABLE IF EXISTS `act_re_procdef`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_re_procdef` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `CATEGORY_` varchar(255) DEFAULT NULL,
  `NAME_` varchar(255) DEFAULT NULL,
  `KEY_` varchar(255) NOT NULL,
  `VERSION_` int(11) NOT NULL,
  `DEPLOYMENT_ID_` varchar(64) DEFAULT NULL,
  `RESOURCE_NAME_` varchar(4000) DEFAULT NULL,
  `DGRM_RESOURCE_NAME_` varchar(4000) DEFAULT NULL,
  `DESCRIPTION_` varchar(4000) DEFAULT NULL,
  `HAS_START_FORM_KEY_` tinyint(4) DEFAULT NULL,
  `HAS_GRAPHICAL_NOTATION_` tinyint(4) DEFAULT NULL,
  `SUSPENSION_STATE_` int(11) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  `ENGINE_VERSION_` varchar(255) DEFAULT NULL,
  `DERIVED_FROM_` varchar(64) DEFAULT NULL,
  `DERIVED_FROM_ROOT_` varchar(64) DEFAULT NULL,
  `DERIVED_VERSION_` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`ID_`),
  UNIQUE KEY `ACT_UNIQ_PROCDEF` (`KEY_`,`VERSION_`,`DERIVED_VERSION_`,`TENANT_ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_re_procdef`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_re_procdef` WRITE;
/*!40000 ALTER TABLE `act_re_procdef` DISABLE KEYS */;
INSERT INTO `act_re_procdef` VALUES
('leave_approval_demo:9:e00dec0a-c58f-11f1-92ce-b6a8b1076472',1,'http://workflow.local/demo','ËØ∑ÂÅáÂÆ°Êâπ-ÈÄªËæëÊµÅÊºîÁ§∫','leave_approval_demo',9,'e00400f7-c58f-11f1-92ce-b6a8b1076472','leave_approval_demo.bpmn20.xml','leave_approval_demo.leave_approval_demo.png',NULL,0,1,1,'default',NULL,NULL,NULL,0);
/*!40000 ALTER TABLE `act_re_procdef` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_ru_actinst`
--

DROP TABLE IF EXISTS `act_ru_actinst`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_ru_actinst` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT 1,
  `PROC_DEF_ID_` varchar(64) NOT NULL,
  `PROC_INST_ID_` varchar(64) NOT NULL,
  `EXECUTION_ID_` varchar(64) NOT NULL,
  `ACT_ID_` varchar(255) NOT NULL,
  `TASK_ID_` varchar(64) DEFAULT NULL,
  `CALL_PROC_INST_ID_` varchar(64) DEFAULT NULL,
  `ACT_NAME_` varchar(255) DEFAULT NULL,
  `ACT_TYPE_` varchar(255) NOT NULL,
  `ASSIGNEE_` varchar(255) DEFAULT NULL,
  `COMPLETED_BY_` varchar(255) DEFAULT NULL,
  `START_TIME_` datetime(3) NOT NULL,
  `END_TIME_` datetime(3) DEFAULT NULL,
  `DURATION_` bigint(20) DEFAULT NULL,
  `TRANSACTION_ORDER_` int(11) DEFAULT NULL,
  `DELETE_REASON_` varchar(4000) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_RU_ACTI_START` (`START_TIME_`),
  KEY `ACT_IDX_RU_ACTI_END` (`END_TIME_`),
  KEY `ACT_IDX_RU_ACTI_PROC` (`PROC_INST_ID_`),
  KEY `ACT_IDX_RU_ACTI_PROC_ACT` (`PROC_INST_ID_`,`ACT_ID_`),
  KEY `ACT_IDX_RU_ACTI_EXEC` (`EXECUTION_ID_`),
  KEY `ACT_IDX_RU_ACTI_EXEC_ACT` (`EXECUTION_ID_`,`ACT_ID_`),
  KEY `ACT_IDX_RU_ACTI_TASK` (`TASK_ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_ru_actinst`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_ru_actinst` WRITE;
/*!40000 ALTER TABLE `act_ru_actinst` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_ru_actinst` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_ru_deadletter_job`
--

DROP TABLE IF EXISTS `act_ru_deadletter_job`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_ru_deadletter_job` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `CATEGORY_` varchar(255) DEFAULT NULL,
  `TYPE_` varchar(255) NOT NULL,
  `EXCLUSIVE_` tinyint(1) DEFAULT NULL,
  `EXECUTION_ID_` varchar(64) DEFAULT NULL,
  `PROCESS_INSTANCE_ID_` varchar(64) DEFAULT NULL,
  `PROC_DEF_ID_` varchar(64) DEFAULT NULL,
  `ELEMENT_ID_` varchar(255) DEFAULT NULL,
  `ELEMENT_NAME_` varchar(255) DEFAULT NULL,
  `SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SUB_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `SCOPE_DEFINITION_ID_` varchar(255) DEFAULT NULL,
  `CORRELATION_ID_` varchar(255) DEFAULT NULL,
  `EXCEPTION_STACK_ID_` varchar(64) DEFAULT NULL,
  `EXCEPTION_MSG_` varchar(4000) DEFAULT NULL,
  `DUEDATE_` timestamp(3) NULL DEFAULT NULL,
  `REPEAT_` varchar(255) DEFAULT NULL,
  `HANDLER_TYPE_` varchar(255) DEFAULT NULL,
  `HANDLER_CFG_` varchar(4000) DEFAULT NULL,
  `CUSTOM_VALUES_ID_` varchar(64) DEFAULT NULL,
  `CREATE_TIME_` timestamp(3) NULL DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_DEADLETTER_JOB_EXCEPTION_STACK_ID` (`EXCEPTION_STACK_ID_`),
  KEY `ACT_IDX_DEADLETTER_JOB_CUSTOM_VALUES_ID` (`CUSTOM_VALUES_ID_`),
  KEY `ACT_IDX_DEADLETTER_JOB_CORRELATION_ID` (`CORRELATION_ID_`),
  KEY `ACT_IDX_DJOB_SCOPE` (`SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_DJOB_SUB_SCOPE` (`SUB_SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_DJOB_SCOPE_DEF` (`SCOPE_DEFINITION_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_FK_DEADLETTER_JOB_EXECUTION` (`EXECUTION_ID_`),
  KEY `ACT_FK_DEADLETTER_JOB_PROCESS_INSTANCE` (`PROCESS_INSTANCE_ID_`),
  KEY `ACT_FK_DEADLETTER_JOB_PROC_DEF` (`PROC_DEF_ID_`),
  CONSTRAINT `ACT_FK_DEADLETTER_JOB_CUSTOM_VALUES` FOREIGN KEY (`CUSTOM_VALUES_ID_`) REFERENCES `act_ge_bytearray` (`ID_`),
  CONSTRAINT `ACT_FK_DEADLETTER_JOB_EXCEPTION` FOREIGN KEY (`EXCEPTION_STACK_ID_`) REFERENCES `act_ge_bytearray` (`ID_`),
  CONSTRAINT `ACT_FK_DEADLETTER_JOB_EXECUTION` FOREIGN KEY (`EXECUTION_ID_`) REFERENCES `act_ru_execution` (`ID_`),
  CONSTRAINT `ACT_FK_DEADLETTER_JOB_PROCESS_INSTANCE` FOREIGN KEY (`PROCESS_INSTANCE_ID_`) REFERENCES `act_ru_execution` (`ID_`),
  CONSTRAINT `ACT_FK_DEADLETTER_JOB_PROC_DEF` FOREIGN KEY (`PROC_DEF_ID_`) REFERENCES `act_re_procdef` (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_ru_deadletter_job`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_ru_deadletter_job` WRITE;
/*!40000 ALTER TABLE `act_ru_deadletter_job` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_ru_deadletter_job` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_ru_entitylink`
--

DROP TABLE IF EXISTS `act_ru_entitylink`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_ru_entitylink` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `CREATE_TIME_` datetime(3) DEFAULT NULL,
  `LINK_TYPE_` varchar(255) DEFAULT NULL,
  `SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SUB_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `SCOPE_DEFINITION_ID_` varchar(255) DEFAULT NULL,
  `PARENT_ELEMENT_ID_` varchar(255) DEFAULT NULL,
  `REF_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `REF_SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `REF_SCOPE_DEFINITION_ID_` varchar(255) DEFAULT NULL,
  `ROOT_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `ROOT_SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `HIERARCHY_TYPE_` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_ENT_LNK_SCOPE` (`SCOPE_ID_`,`SCOPE_TYPE_`,`LINK_TYPE_`),
  KEY `ACT_IDX_ENT_LNK_REF_SCOPE` (`REF_SCOPE_ID_`,`REF_SCOPE_TYPE_`,`LINK_TYPE_`),
  KEY `ACT_IDX_ENT_LNK_ROOT_SCOPE` (`ROOT_SCOPE_ID_`,`ROOT_SCOPE_TYPE_`,`LINK_TYPE_`),
  KEY `ACT_IDX_ENT_LNK_SCOPE_DEF` (`SCOPE_DEFINITION_ID_`,`SCOPE_TYPE_`,`LINK_TYPE_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_ru_entitylink`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_ru_entitylink` WRITE;
/*!40000 ALTER TABLE `act_ru_entitylink` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_ru_entitylink` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_ru_event_subscr`
--

DROP TABLE IF EXISTS `act_ru_event_subscr`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_ru_event_subscr` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `EVENT_TYPE_` varchar(255) NOT NULL,
  `EVENT_NAME_` varchar(255) DEFAULT NULL,
  `EXECUTION_ID_` varchar(64) DEFAULT NULL,
  `PROC_INST_ID_` varchar(64) DEFAULT NULL,
  `ACTIVITY_ID_` varchar(64) DEFAULT NULL,
  `CONFIGURATION_` varchar(255) DEFAULT NULL,
  `CREATED_` timestamp(3) NOT NULL DEFAULT current_timestamp(3),
  `PROC_DEF_ID_` varchar(64) DEFAULT NULL,
  `SUB_SCOPE_ID_` varchar(64) DEFAULT NULL,
  `SCOPE_ID_` varchar(64) DEFAULT NULL,
  `SCOPE_DEFINITION_ID_` varchar(64) DEFAULT NULL,
  `SCOPE_DEFINITION_KEY_` varchar(255) DEFAULT NULL,
  `SCOPE_TYPE_` varchar(64) DEFAULT NULL,
  `LOCK_TIME_` timestamp(3) NULL DEFAULT NULL,
  `LOCK_OWNER_` varchar(255) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_EVENT_SUBSCR_CONFIG_` (`CONFIGURATION_`),
  KEY `ACT_IDX_EVENT_SUBSCR_EXEC_ID` (`EXECUTION_ID_`),
  KEY `ACT_IDX_EVENT_SUBSCR_PROC_ID` (`PROC_INST_ID_`),
  KEY `ACT_IDX_EVENT_SUBSCR_SCOPEREF_` (`SCOPE_ID_`,`SCOPE_TYPE_`),
  CONSTRAINT `ACT_FK_EVENT_EXEC` FOREIGN KEY (`EXECUTION_ID_`) REFERENCES `act_ru_execution` (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_ru_event_subscr`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_ru_event_subscr` WRITE;
/*!40000 ALTER TABLE `act_ru_event_subscr` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_ru_event_subscr` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_ru_execution`
--

DROP TABLE IF EXISTS `act_ru_execution`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_ru_execution` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `PROC_INST_ID_` varchar(64) DEFAULT NULL,
  `BUSINESS_KEY_` varchar(255) DEFAULT NULL,
  `PARENT_ID_` varchar(64) DEFAULT NULL,
  `PROC_DEF_ID_` varchar(64) DEFAULT NULL,
  `SUPER_EXEC_` varchar(64) DEFAULT NULL,
  `ROOT_PROC_INST_ID_` varchar(64) DEFAULT NULL,
  `ACT_ID_` varchar(255) DEFAULT NULL,
  `IS_ACTIVE_` tinyint(4) DEFAULT NULL,
  `IS_CONCURRENT_` tinyint(4) DEFAULT NULL,
  `IS_SCOPE_` tinyint(4) DEFAULT NULL,
  `IS_EVENT_SCOPE_` tinyint(4) DEFAULT NULL,
  `IS_MI_ROOT_` tinyint(4) DEFAULT NULL,
  `SUSPENSION_STATE_` int(11) DEFAULT NULL,
  `CACHED_ENT_STATE_` int(11) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  `NAME_` varchar(255) DEFAULT NULL,
  `START_ACT_ID_` varchar(255) DEFAULT NULL,
  `START_TIME_` datetime(3) DEFAULT NULL,
  `START_USER_ID_` varchar(255) DEFAULT NULL,
  `LOCK_TIME_` timestamp(3) NULL DEFAULT NULL,
  `LOCK_OWNER_` varchar(255) DEFAULT NULL,
  `IS_COUNT_ENABLED_` tinyint(4) DEFAULT NULL,
  `EVT_SUBSCR_COUNT_` int(11) DEFAULT NULL,
  `TASK_COUNT_` int(11) DEFAULT NULL,
  `JOB_COUNT_` int(11) DEFAULT NULL,
  `TIMER_JOB_COUNT_` int(11) DEFAULT NULL,
  `SUSP_JOB_COUNT_` int(11) DEFAULT NULL,
  `DEADLETTER_JOB_COUNT_` int(11) DEFAULT NULL,
  `EXTERNAL_WORKER_JOB_COUNT_` int(11) DEFAULT NULL,
  `VAR_COUNT_` int(11) DEFAULT NULL,
  `ID_LINK_COUNT_` int(11) DEFAULT NULL,
  `CALLBACK_ID_` varchar(255) DEFAULT NULL,
  `CALLBACK_TYPE_` varchar(255) DEFAULT NULL,
  `REFERENCE_ID_` varchar(255) DEFAULT NULL,
  `REFERENCE_TYPE_` varchar(255) DEFAULT NULL,
  `PROPAGATED_STAGE_INST_ID_` varchar(255) DEFAULT NULL,
  `BUSINESS_STATUS_` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_EXEC_BUSKEY` (`BUSINESS_KEY_`),
  KEY `ACT_IDC_EXEC_ROOT` (`ROOT_PROC_INST_ID_`),
  KEY `ACT_IDX_EXEC_REF_ID_` (`REFERENCE_ID_`),
  KEY `ACT_FK_EXE_PROCINST` (`PROC_INST_ID_`),
  KEY `ACT_FK_EXE_PARENT` (`PARENT_ID_`),
  KEY `ACT_FK_EXE_SUPER` (`SUPER_EXEC_`),
  KEY `ACT_FK_EXE_PROCDEF` (`PROC_DEF_ID_`),
  CONSTRAINT `ACT_FK_EXE_PARENT` FOREIGN KEY (`PARENT_ID_`) REFERENCES `act_ru_execution` (`ID_`) ON DELETE CASCADE,
  CONSTRAINT `ACT_FK_EXE_PROCDEF` FOREIGN KEY (`PROC_DEF_ID_`) REFERENCES `act_re_procdef` (`ID_`),
  CONSTRAINT `ACT_FK_EXE_PROCINST` FOREIGN KEY (`PROC_INST_ID_`) REFERENCES `act_ru_execution` (`ID_`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ACT_FK_EXE_SUPER` FOREIGN KEY (`SUPER_EXEC_`) REFERENCES `act_ru_execution` (`ID_`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_ru_execution`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_ru_execution` WRITE;
/*!40000 ALTER TABLE `act_ru_execution` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_ru_execution` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_ru_external_job`
--

DROP TABLE IF EXISTS `act_ru_external_job`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_ru_external_job` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `CATEGORY_` varchar(255) DEFAULT NULL,
  `TYPE_` varchar(255) NOT NULL,
  `LOCK_EXP_TIME_` timestamp(3) NULL DEFAULT NULL,
  `LOCK_OWNER_` varchar(255) DEFAULT NULL,
  `EXCLUSIVE_` tinyint(1) DEFAULT NULL,
  `EXECUTION_ID_` varchar(64) DEFAULT NULL,
  `PROCESS_INSTANCE_ID_` varchar(64) DEFAULT NULL,
  `PROC_DEF_ID_` varchar(64) DEFAULT NULL,
  `ELEMENT_ID_` varchar(255) DEFAULT NULL,
  `ELEMENT_NAME_` varchar(255) DEFAULT NULL,
  `SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SUB_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `SCOPE_DEFINITION_ID_` varchar(255) DEFAULT NULL,
  `CORRELATION_ID_` varchar(255) DEFAULT NULL,
  `RETRIES_` int(11) DEFAULT NULL,
  `EXCEPTION_STACK_ID_` varchar(64) DEFAULT NULL,
  `EXCEPTION_MSG_` varchar(4000) DEFAULT NULL,
  `DUEDATE_` timestamp(3) NULL DEFAULT NULL,
  `REPEAT_` varchar(255) DEFAULT NULL,
  `HANDLER_TYPE_` varchar(255) DEFAULT NULL,
  `HANDLER_CFG_` varchar(4000) DEFAULT NULL,
  `CUSTOM_VALUES_ID_` varchar(64) DEFAULT NULL,
  `CREATE_TIME_` timestamp(3) NULL DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_EXTERNAL_JOB_EXCEPTION_STACK_ID` (`EXCEPTION_STACK_ID_`),
  KEY `ACT_IDX_EXTERNAL_JOB_CUSTOM_VALUES_ID` (`CUSTOM_VALUES_ID_`),
  KEY `ACT_IDX_EXTERNAL_JOB_CORRELATION_ID` (`CORRELATION_ID_`),
  KEY `ACT_IDX_EJOB_SCOPE` (`SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_EJOB_SUB_SCOPE` (`SUB_SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_EJOB_SCOPE_DEF` (`SCOPE_DEFINITION_ID_`,`SCOPE_TYPE_`),
  CONSTRAINT `ACT_FK_EXTERNAL_JOB_CUSTOM_VALUES` FOREIGN KEY (`CUSTOM_VALUES_ID_`) REFERENCES `act_ge_bytearray` (`ID_`),
  CONSTRAINT `ACT_FK_EXTERNAL_JOB_EXCEPTION` FOREIGN KEY (`EXCEPTION_STACK_ID_`) REFERENCES `act_ge_bytearray` (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_ru_external_job`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_ru_external_job` WRITE;
/*!40000 ALTER TABLE `act_ru_external_job` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_ru_external_job` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_ru_history_job`
--

DROP TABLE IF EXISTS `act_ru_history_job`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_ru_history_job` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `LOCK_EXP_TIME_` timestamp(3) NULL DEFAULT NULL,
  `LOCK_OWNER_` varchar(255) DEFAULT NULL,
  `RETRIES_` int(11) DEFAULT NULL,
  `EXCEPTION_STACK_ID_` varchar(64) DEFAULT NULL,
  `EXCEPTION_MSG_` varchar(4000) DEFAULT NULL,
  `HANDLER_TYPE_` varchar(255) DEFAULT NULL,
  `HANDLER_CFG_` varchar(4000) DEFAULT NULL,
  `CUSTOM_VALUES_ID_` varchar(64) DEFAULT NULL,
  `ADV_HANDLER_CFG_ID_` varchar(64) DEFAULT NULL,
  `CREATE_TIME_` timestamp(3) NULL DEFAULT NULL,
  `SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  PRIMARY KEY (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_ru_history_job`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_ru_history_job` WRITE;
/*!40000 ALTER TABLE `act_ru_history_job` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_ru_history_job` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_ru_identitylink`
--

DROP TABLE IF EXISTS `act_ru_identitylink`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_ru_identitylink` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `GROUP_ID_` varchar(255) DEFAULT NULL,
  `TYPE_` varchar(255) DEFAULT NULL,
  `USER_ID_` varchar(255) DEFAULT NULL,
  `TASK_ID_` varchar(64) DEFAULT NULL,
  `PROC_INST_ID_` varchar(64) DEFAULT NULL,
  `PROC_DEF_ID_` varchar(64) DEFAULT NULL,
  `SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SUB_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `SCOPE_DEFINITION_ID_` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_IDENT_LNK_USER` (`USER_ID_`),
  KEY `ACT_IDX_IDENT_LNK_GROUP` (`GROUP_ID_`),
  KEY `ACT_IDX_IDENT_LNK_SCOPE` (`SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_IDENT_LNK_SUB_SCOPE` (`SUB_SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_IDENT_LNK_SCOPE_DEF` (`SCOPE_DEFINITION_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_ATHRZ_PROCEDEF` (`PROC_DEF_ID_`),
  KEY `ACT_FK_TSKASS_TASK` (`TASK_ID_`),
  KEY `ACT_FK_IDL_PROCINST` (`PROC_INST_ID_`),
  CONSTRAINT `ACT_FK_ATHRZ_PROCEDEF` FOREIGN KEY (`PROC_DEF_ID_`) REFERENCES `act_re_procdef` (`ID_`),
  CONSTRAINT `ACT_FK_IDL_PROCINST` FOREIGN KEY (`PROC_INST_ID_`) REFERENCES `act_ru_execution` (`ID_`),
  CONSTRAINT `ACT_FK_TSKASS_TASK` FOREIGN KEY (`TASK_ID_`) REFERENCES `act_ru_task` (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_ru_identitylink`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_ru_identitylink` WRITE;
/*!40000 ALTER TABLE `act_ru_identitylink` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_ru_identitylink` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_ru_job`
--

DROP TABLE IF EXISTS `act_ru_job`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_ru_job` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `CATEGORY_` varchar(255) DEFAULT NULL,
  `TYPE_` varchar(255) NOT NULL,
  `LOCK_EXP_TIME_` timestamp(3) NULL DEFAULT NULL,
  `LOCK_OWNER_` varchar(255) DEFAULT NULL,
  `EXCLUSIVE_` tinyint(1) DEFAULT NULL,
  `EXECUTION_ID_` varchar(64) DEFAULT NULL,
  `PROCESS_INSTANCE_ID_` varchar(64) DEFAULT NULL,
  `PROC_DEF_ID_` varchar(64) DEFAULT NULL,
  `ELEMENT_ID_` varchar(255) DEFAULT NULL,
  `ELEMENT_NAME_` varchar(255) DEFAULT NULL,
  `SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SUB_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `SCOPE_DEFINITION_ID_` varchar(255) DEFAULT NULL,
  `CORRELATION_ID_` varchar(255) DEFAULT NULL,
  `RETRIES_` int(11) DEFAULT NULL,
  `EXCEPTION_STACK_ID_` varchar(64) DEFAULT NULL,
  `EXCEPTION_MSG_` varchar(4000) DEFAULT NULL,
  `DUEDATE_` timestamp(3) NULL DEFAULT NULL,
  `REPEAT_` varchar(255) DEFAULT NULL,
  `HANDLER_TYPE_` varchar(255) DEFAULT NULL,
  `HANDLER_CFG_` varchar(4000) DEFAULT NULL,
  `CUSTOM_VALUES_ID_` varchar(64) DEFAULT NULL,
  `CREATE_TIME_` timestamp(3) NULL DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_JOB_EXCEPTION_STACK_ID` (`EXCEPTION_STACK_ID_`),
  KEY `ACT_IDX_JOB_CUSTOM_VALUES_ID` (`CUSTOM_VALUES_ID_`),
  KEY `ACT_IDX_JOB_CORRELATION_ID` (`CORRELATION_ID_`),
  KEY `ACT_IDX_JOB_SCOPE` (`SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_JOB_SUB_SCOPE` (`SUB_SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_JOB_SCOPE_DEF` (`SCOPE_DEFINITION_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_FK_JOB_EXECUTION` (`EXECUTION_ID_`),
  KEY `ACT_FK_JOB_PROCESS_INSTANCE` (`PROCESS_INSTANCE_ID_`),
  KEY `ACT_FK_JOB_PROC_DEF` (`PROC_DEF_ID_`),
  CONSTRAINT `ACT_FK_JOB_CUSTOM_VALUES` FOREIGN KEY (`CUSTOM_VALUES_ID_`) REFERENCES `act_ge_bytearray` (`ID_`),
  CONSTRAINT `ACT_FK_JOB_EXCEPTION` FOREIGN KEY (`EXCEPTION_STACK_ID_`) REFERENCES `act_ge_bytearray` (`ID_`),
  CONSTRAINT `ACT_FK_JOB_EXECUTION` FOREIGN KEY (`EXECUTION_ID_`) REFERENCES `act_ru_execution` (`ID_`),
  CONSTRAINT `ACT_FK_JOB_PROCESS_INSTANCE` FOREIGN KEY (`PROCESS_INSTANCE_ID_`) REFERENCES `act_ru_execution` (`ID_`),
  CONSTRAINT `ACT_FK_JOB_PROC_DEF` FOREIGN KEY (`PROC_DEF_ID_`) REFERENCES `act_re_procdef` (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_ru_job`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_ru_job` WRITE;
/*!40000 ALTER TABLE `act_ru_job` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_ru_job` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_ru_suspended_job`
--

DROP TABLE IF EXISTS `act_ru_suspended_job`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_ru_suspended_job` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `CATEGORY_` varchar(255) DEFAULT NULL,
  `TYPE_` varchar(255) NOT NULL,
  `EXCLUSIVE_` tinyint(1) DEFAULT NULL,
  `EXECUTION_ID_` varchar(64) DEFAULT NULL,
  `PROCESS_INSTANCE_ID_` varchar(64) DEFAULT NULL,
  `PROC_DEF_ID_` varchar(64) DEFAULT NULL,
  `ELEMENT_ID_` varchar(255) DEFAULT NULL,
  `ELEMENT_NAME_` varchar(255) DEFAULT NULL,
  `SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SUB_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `SCOPE_DEFINITION_ID_` varchar(255) DEFAULT NULL,
  `CORRELATION_ID_` varchar(255) DEFAULT NULL,
  `RETRIES_` int(11) DEFAULT NULL,
  `EXCEPTION_STACK_ID_` varchar(64) DEFAULT NULL,
  `EXCEPTION_MSG_` varchar(4000) DEFAULT NULL,
  `DUEDATE_` timestamp(3) NULL DEFAULT NULL,
  `REPEAT_` varchar(255) DEFAULT NULL,
  `HANDLER_TYPE_` varchar(255) DEFAULT NULL,
  `HANDLER_CFG_` varchar(4000) DEFAULT NULL,
  `CUSTOM_VALUES_ID_` varchar(64) DEFAULT NULL,
  `CREATE_TIME_` timestamp(3) NULL DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_SUSPENDED_JOB_EXCEPTION_STACK_ID` (`EXCEPTION_STACK_ID_`),
  KEY `ACT_IDX_SUSPENDED_JOB_CUSTOM_VALUES_ID` (`CUSTOM_VALUES_ID_`),
  KEY `ACT_IDX_SUSPENDED_JOB_CORRELATION_ID` (`CORRELATION_ID_`),
  KEY `ACT_IDX_SJOB_SCOPE` (`SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_SJOB_SUB_SCOPE` (`SUB_SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_SJOB_SCOPE_DEF` (`SCOPE_DEFINITION_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_FK_SUSPENDED_JOB_EXECUTION` (`EXECUTION_ID_`),
  KEY `ACT_FK_SUSPENDED_JOB_PROCESS_INSTANCE` (`PROCESS_INSTANCE_ID_`),
  KEY `ACT_FK_SUSPENDED_JOB_PROC_DEF` (`PROC_DEF_ID_`),
  CONSTRAINT `ACT_FK_SUSPENDED_JOB_CUSTOM_VALUES` FOREIGN KEY (`CUSTOM_VALUES_ID_`) REFERENCES `act_ge_bytearray` (`ID_`),
  CONSTRAINT `ACT_FK_SUSPENDED_JOB_EXCEPTION` FOREIGN KEY (`EXCEPTION_STACK_ID_`) REFERENCES `act_ge_bytearray` (`ID_`),
  CONSTRAINT `ACT_FK_SUSPENDED_JOB_EXECUTION` FOREIGN KEY (`EXECUTION_ID_`) REFERENCES `act_ru_execution` (`ID_`),
  CONSTRAINT `ACT_FK_SUSPENDED_JOB_PROCESS_INSTANCE` FOREIGN KEY (`PROCESS_INSTANCE_ID_`) REFERENCES `act_ru_execution` (`ID_`),
  CONSTRAINT `ACT_FK_SUSPENDED_JOB_PROC_DEF` FOREIGN KEY (`PROC_DEF_ID_`) REFERENCES `act_re_procdef` (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_ru_suspended_job`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_ru_suspended_job` WRITE;
/*!40000 ALTER TABLE `act_ru_suspended_job` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_ru_suspended_job` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_ru_task`
--

DROP TABLE IF EXISTS `act_ru_task`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_ru_task` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `EXECUTION_ID_` varchar(64) DEFAULT NULL,
  `PROC_INST_ID_` varchar(64) DEFAULT NULL,
  `PROC_DEF_ID_` varchar(64) DEFAULT NULL,
  `TASK_DEF_ID_` varchar(64) DEFAULT NULL,
  `SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SUB_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `SCOPE_DEFINITION_ID_` varchar(255) DEFAULT NULL,
  `PROPAGATED_STAGE_INST_ID_` varchar(255) DEFAULT NULL,
  `STATE_` varchar(255) DEFAULT NULL,
  `NAME_` varchar(255) DEFAULT NULL,
  `PARENT_TASK_ID_` varchar(64) DEFAULT NULL,
  `DESCRIPTION_` varchar(4000) DEFAULT NULL,
  `TASK_DEF_KEY_` varchar(255) DEFAULT NULL,
  `OWNER_` varchar(255) DEFAULT NULL,
  `ASSIGNEE_` varchar(255) DEFAULT NULL,
  `DELEGATION_` varchar(64) DEFAULT NULL,
  `PRIORITY_` int(11) DEFAULT NULL,
  `CREATE_TIME_` timestamp(3) NULL DEFAULT NULL,
  `IN_PROGRESS_TIME_` datetime(3) DEFAULT NULL,
  `IN_PROGRESS_STARTED_BY_` varchar(255) DEFAULT NULL,
  `CLAIM_TIME_` datetime(3) DEFAULT NULL,
  `CLAIMED_BY_` varchar(255) DEFAULT NULL,
  `SUSPENDED_TIME_` datetime(3) DEFAULT NULL,
  `SUSPENDED_BY_` varchar(255) DEFAULT NULL,
  `IN_PROGRESS_DUE_DATE_` datetime(3) DEFAULT NULL,
  `DUE_DATE_` datetime(3) DEFAULT NULL,
  `CATEGORY_` varchar(255) DEFAULT NULL,
  `SUSPENSION_STATE_` int(11) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  `FORM_KEY_` varchar(255) DEFAULT NULL,
  `IS_COUNT_ENABLED_` tinyint(4) DEFAULT NULL,
  `VAR_COUNT_` int(11) DEFAULT NULL,
  `ID_LINK_COUNT_` int(11) DEFAULT NULL,
  `SUB_TASK_COUNT_` int(11) DEFAULT NULL,
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_TASK_CREATE` (`CREATE_TIME_`),
  KEY `ACT_IDX_TASK_SCOPE` (`SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_TASK_SUB_SCOPE` (`SUB_SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_TASK_SCOPE_DEF` (`SCOPE_DEFINITION_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_FK_TASK_EXE` (`EXECUTION_ID_`),
  KEY `ACT_FK_TASK_PROCINST` (`PROC_INST_ID_`),
  KEY `ACT_FK_TASK_PROCDEF` (`PROC_DEF_ID_`),
  CONSTRAINT `ACT_FK_TASK_EXE` FOREIGN KEY (`EXECUTION_ID_`) REFERENCES `act_ru_execution` (`ID_`),
  CONSTRAINT `ACT_FK_TASK_PROCDEF` FOREIGN KEY (`PROC_DEF_ID_`) REFERENCES `act_re_procdef` (`ID_`),
  CONSTRAINT `ACT_FK_TASK_PROCINST` FOREIGN KEY (`PROC_INST_ID_`) REFERENCES `act_ru_execution` (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_ru_task`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_ru_task` WRITE;
/*!40000 ALTER TABLE `act_ru_task` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_ru_task` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_ru_timer_job`
--

DROP TABLE IF EXISTS `act_ru_timer_job`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_ru_timer_job` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `CATEGORY_` varchar(255) DEFAULT NULL,
  `TYPE_` varchar(255) NOT NULL,
  `LOCK_EXP_TIME_` timestamp(3) NULL DEFAULT NULL,
  `LOCK_OWNER_` varchar(255) DEFAULT NULL,
  `EXCLUSIVE_` tinyint(1) DEFAULT NULL,
  `EXECUTION_ID_` varchar(64) DEFAULT NULL,
  `PROCESS_INSTANCE_ID_` varchar(64) DEFAULT NULL,
  `PROC_DEF_ID_` varchar(64) DEFAULT NULL,
  `ELEMENT_ID_` varchar(255) DEFAULT NULL,
  `ELEMENT_NAME_` varchar(255) DEFAULT NULL,
  `SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SUB_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `SCOPE_DEFINITION_ID_` varchar(255) DEFAULT NULL,
  `CORRELATION_ID_` varchar(255) DEFAULT NULL,
  `RETRIES_` int(11) DEFAULT NULL,
  `EXCEPTION_STACK_ID_` varchar(64) DEFAULT NULL,
  `EXCEPTION_MSG_` varchar(4000) DEFAULT NULL,
  `DUEDATE_` timestamp(3) NULL DEFAULT NULL,
  `REPEAT_` varchar(255) DEFAULT NULL,
  `HANDLER_TYPE_` varchar(255) DEFAULT NULL,
  `HANDLER_CFG_` varchar(4000) DEFAULT NULL,
  `CUSTOM_VALUES_ID_` varchar(64) DEFAULT NULL,
  `CREATE_TIME_` timestamp(3) NULL DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_TIMER_JOB_EXCEPTION_STACK_ID` (`EXCEPTION_STACK_ID_`),
  KEY `ACT_IDX_TIMER_JOB_CUSTOM_VALUES_ID` (`CUSTOM_VALUES_ID_`),
  KEY `ACT_IDX_TIMER_JOB_CORRELATION_ID` (`CORRELATION_ID_`),
  KEY `ACT_IDX_TIMER_JOB_DUEDATE` (`DUEDATE_`),
  KEY `ACT_IDX_TJOB_SCOPE` (`SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_TJOB_SUB_SCOPE` (`SUB_SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_TJOB_SCOPE_DEF` (`SCOPE_DEFINITION_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_FK_TIMER_JOB_EXECUTION` (`EXECUTION_ID_`),
  KEY `ACT_FK_TIMER_JOB_PROCESS_INSTANCE` (`PROCESS_INSTANCE_ID_`),
  KEY `ACT_FK_TIMER_JOB_PROC_DEF` (`PROC_DEF_ID_`),
  CONSTRAINT `ACT_FK_TIMER_JOB_CUSTOM_VALUES` FOREIGN KEY (`CUSTOM_VALUES_ID_`) REFERENCES `act_ge_bytearray` (`ID_`),
  CONSTRAINT `ACT_FK_TIMER_JOB_EXCEPTION` FOREIGN KEY (`EXCEPTION_STACK_ID_`) REFERENCES `act_ge_bytearray` (`ID_`),
  CONSTRAINT `ACT_FK_TIMER_JOB_EXECUTION` FOREIGN KEY (`EXECUTION_ID_`) REFERENCES `act_ru_execution` (`ID_`),
  CONSTRAINT `ACT_FK_TIMER_JOB_PROCESS_INSTANCE` FOREIGN KEY (`PROCESS_INSTANCE_ID_`) REFERENCES `act_ru_execution` (`ID_`),
  CONSTRAINT `ACT_FK_TIMER_JOB_PROC_DEF` FOREIGN KEY (`PROC_DEF_ID_`) REFERENCES `act_re_procdef` (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_ru_timer_job`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_ru_timer_job` WRITE;
/*!40000 ALTER TABLE `act_ru_timer_job` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_ru_timer_job` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_ru_variable`
--

DROP TABLE IF EXISTS `act_ru_variable`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_ru_variable` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `TYPE_` varchar(255) NOT NULL,
  `NAME_` varchar(255) NOT NULL,
  `EXECUTION_ID_` varchar(64) DEFAULT NULL,
  `PROC_INST_ID_` varchar(64) DEFAULT NULL,
  `TASK_ID_` varchar(64) DEFAULT NULL,
  `SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SUB_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `BYTEARRAY_ID_` varchar(64) DEFAULT NULL,
  `DOUBLE_` double DEFAULT NULL,
  `LONG_` bigint(20) DEFAULT NULL,
  `TEXT_` varchar(4000) DEFAULT NULL,
  `TEXT2_` varchar(4000) DEFAULT NULL,
  `META_INFO_` varchar(4000) DEFAULT NULL,
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_RU_VAR_SCOPE_ID_TYPE` (`SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_RU_VAR_SUB_ID_TYPE` (`SUB_SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_FK_VAR_BYTEARRAY` (`BYTEARRAY_ID_`),
  KEY `ACT_IDX_VARIABLE_TASK_ID` (`TASK_ID_`),
  KEY `ACT_FK_VAR_EXE` (`EXECUTION_ID_`),
  KEY `ACT_FK_VAR_PROCINST` (`PROC_INST_ID_`),
  CONSTRAINT `ACT_FK_VAR_BYTEARRAY` FOREIGN KEY (`BYTEARRAY_ID_`) REFERENCES `act_ge_bytearray` (`ID_`),
  CONSTRAINT `ACT_FK_VAR_EXE` FOREIGN KEY (`EXECUTION_ID_`) REFERENCES `act_ru_execution` (`ID_`),
  CONSTRAINT `ACT_FK_VAR_PROCINST` FOREIGN KEY (`PROC_INST_ID_`) REFERENCES `act_ru_execution` (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_ru_variable`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_ru_variable` WRITE;
/*!40000 ALTER TABLE `act_ru_variable` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_ru_variable` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `event_publication`
--

DROP TABLE IF EXISTS `event_publication`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `event_publication` (
  `id` uuid NOT NULL,
  `completion_attempts` int(11) NOT NULL,
  `completion_date` datetime(6) DEFAULT NULL,
  `event_type` varchar(255) DEFAULT NULL,
  `last_resubmission_date` datetime(6) DEFAULT NULL,
  `listener_id` varchar(255) DEFAULT NULL,
  `publication_date` datetime(6) DEFAULT NULL,
  `serialized_event` varchar(255) DEFAULT NULL,
  `status` enum('COMPLETED','FAILED','PROCESSING','PUBLISHED','RESUBMITTED') DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `event_publication`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `event_publication` WRITE;
/*!40000 ALTER TABLE `event_publication` DISABLE KEYS */;
/*!40000 ALTER TABLE `event_publication` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `flw_channel_definition`
--

DROP TABLE IF EXISTS `flw_channel_definition`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `flw_channel_definition` (
  `ID_` varchar(255) NOT NULL,
  `NAME_` varchar(255) DEFAULT NULL,
  `VERSION_` int(11) DEFAULT NULL,
  `KEY_` varchar(255) DEFAULT NULL,
  `CATEGORY_` varchar(255) DEFAULT NULL,
  `TYPE_` varchar(255) DEFAULT NULL,
  `IMPLEMENTATION_` varchar(255) DEFAULT NULL,
  `DEPLOYMENT_ID_` varchar(255) DEFAULT NULL,
  `CREATE_TIME_` datetime(3) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT NULL,
  `RESOURCE_NAME_` varchar(255) DEFAULT NULL,
  `DESCRIPTION_` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ID_`),
  UNIQUE KEY `ACT_IDX_CHANNEL_DEF_UNIQ` (`KEY_`,`VERSION_`,`TENANT_ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `flw_channel_definition`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `flw_channel_definition` WRITE;
/*!40000 ALTER TABLE `flw_channel_definition` DISABLE KEYS */;
/*!40000 ALTER TABLE `flw_channel_definition` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `flw_event_definition`
--

DROP TABLE IF EXISTS `flw_event_definition`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `flw_event_definition` (
  `ID_` varchar(255) NOT NULL,
  `NAME_` varchar(255) DEFAULT NULL,
  `VERSION_` int(11) DEFAULT NULL,
  `KEY_` varchar(255) DEFAULT NULL,
  `CATEGORY_` varchar(255) DEFAULT NULL,
  `DEPLOYMENT_ID_` varchar(255) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT NULL,
  `RESOURCE_NAME_` varchar(255) DEFAULT NULL,
  `DESCRIPTION_` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ID_`),
  UNIQUE KEY `ACT_IDX_EVENT_DEF_UNIQ` (`KEY_`,`VERSION_`,`TENANT_ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `flw_event_definition`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `flw_event_definition` WRITE;
/*!40000 ALTER TABLE `flw_event_definition` DISABLE KEYS */;
/*!40000 ALTER TABLE `flw_event_definition` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `flw_event_deployment`
--

DROP TABLE IF EXISTS `flw_event_deployment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `flw_event_deployment` (
  `ID_` varchar(255) NOT NULL,
  `NAME_` varchar(255) DEFAULT NULL,
  `CATEGORY_` varchar(255) DEFAULT NULL,
  `DEPLOY_TIME_` datetime(3) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT NULL,
  `PARENT_DEPLOYMENT_ID_` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `flw_event_deployment`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `flw_event_deployment` WRITE;
/*!40000 ALTER TABLE `flw_event_deployment` DISABLE KEYS */;
/*!40000 ALTER TABLE `flw_event_deployment` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `flw_event_resource`
--

DROP TABLE IF EXISTS `flw_event_resource`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `flw_event_resource` (
  `ID_` varchar(255) NOT NULL,
  `NAME_` varchar(255) DEFAULT NULL,
  `DEPLOYMENT_ID_` varchar(255) DEFAULT NULL,
  `RESOURCE_BYTES_` longblob DEFAULT NULL,
  PRIMARY KEY (`ID_`),
  KEY `FLW_IDX_EVENT_RSRC_DPL` (`DEPLOYMENT_ID_`),
  CONSTRAINT `FLW_FK_EVENT_RSRC_DPL` FOREIGN KEY (`DEPLOYMENT_ID_`) REFERENCES `flw_event_deployment` (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `flw_event_resource`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `flw_event_resource` WRITE;
/*!40000 ALTER TABLE `flw_event_resource` DISABLE KEYS */;
/*!40000 ALTER TABLE `flw_event_resource` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `flw_ru_batch`
--

DROP TABLE IF EXISTS `flw_ru_batch`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `flw_ru_batch` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `TYPE_` varchar(64) NOT NULL,
  `SEARCH_KEY_` varchar(255) DEFAULT NULL,
  `SEARCH_KEY2_` varchar(255) DEFAULT NULL,
  `CREATE_TIME_` datetime(3) NOT NULL,
  `COMPLETE_TIME_` datetime(3) DEFAULT NULL,
  `STATUS_` varchar(255) DEFAULT NULL,
  `BATCH_DOC_ID_` varchar(64) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  PRIMARY KEY (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `flw_ru_batch`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `flw_ru_batch` WRITE;
/*!40000 ALTER TABLE `flw_ru_batch` DISABLE KEYS */;
/*!40000 ALTER TABLE `flw_ru_batch` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `flw_ru_batch_part`
--

DROP TABLE IF EXISTS `flw_ru_batch_part`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `flw_ru_batch_part` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `BATCH_ID_` varchar(64) DEFAULT NULL,
  `TYPE_` varchar(64) NOT NULL,
  `SCOPE_ID_` varchar(64) DEFAULT NULL,
  `SUB_SCOPE_ID_` varchar(64) DEFAULT NULL,
  `SCOPE_TYPE_` varchar(64) DEFAULT NULL,
  `SEARCH_KEY_` varchar(255) DEFAULT NULL,
  `SEARCH_KEY2_` varchar(255) DEFAULT NULL,
  `CREATE_TIME_` datetime(3) NOT NULL,
  `COMPLETE_TIME_` datetime(3) DEFAULT NULL,
  `STATUS_` varchar(255) DEFAULT NULL,
  `RESULT_DOC_ID_` varchar(64) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  PRIMARY KEY (`ID_`),
  KEY `FLW_IDX_BATCH_PART` (`BATCH_ID_`),
  CONSTRAINT `FLW_FK_BATCH_PART_PARENT` FOREIGN KEY (`BATCH_ID_`) REFERENCES `flw_ru_batch` (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `flw_ru_batch_part`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `flw_ru_batch_part` WRITE;
/*!40000 ALTER TABLE `flw_ru_batch_part` DISABLE KEYS */;
/*!40000 ALTER TABLE `flw_ru_batch_part` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `flyway_schema_history`
--

DROP TABLE IF EXISTS `flyway_schema_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `flyway_schema_history` (
  `installed_rank` int(11) NOT NULL,
  `version` varchar(50) DEFAULT NULL,
  `description` varchar(200) NOT NULL,
  `type` varchar(20) NOT NULL,
  `script` varchar(1000) NOT NULL,
  `checksum` int(11) DEFAULT NULL,
  `installed_by` varchar(100) NOT NULL,
  `installed_on` timestamp NOT NULL DEFAULT current_timestamp(),
  `execution_time` int(11) NOT NULL,
  `success` tinyint(1) NOT NULL,
  PRIMARY KEY (`installed_rank`),
  KEY `flyway_schema_history_s_idx` (`success`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `flyway_schema_history`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `flyway_schema_history` WRITE;
/*!40000 ALTER TABLE `flyway_schema_history` DISABLE KEYS */;
INSERT INTO `flyway_schema_history` VALUES
(1,'1','<< Flyway Baseline >>','BASELINE','<< Flyway Baseline >>',NULL,'root','2026-09-11 10:30:10',0,1),
(2,'2','init','SQL','V2__init.sql',84590707,'root','2026-09-11 10:30:10',25,1),
(3,'1','workflow','SQL','V1__workflow.sql',-1390981594,'root','2026-10-09 00:05:46',255,1),
(4,'39','builtin data sources','SQL','V39__builtin_data_sources.sql',-473665810,'root','2026-10-09 00:05:46',7,1),
(5,'40','create engine notify','SQL','V40__create_engine_notify.sql',-61291012,'root','2026-10-09 00:05:46',2,1),
(6,'41','add task comment signature','SQL','V41__add_task_comment_signature.sql',-1263894200,'root','2026-10-09 00:05:46',2,1),
(7,'49','menu trio and posts recovery','SQL','V49__menu_trio_and_posts_recovery.sql',1233929668,'root','2026-10-09 00:05:46',34,1),
(8,'50','member group dedicated tables','SQL','V50__member_group_dedicated_tables.sql',143610301,'root','2026-10-09 00:05:46',7,1),
(9,'51','sys attachment','SQL','V51__sys_attachment.sql',-1828141019,'root','2026-10-09 00:05:46',2,1),
(10,'52','sys attachment image meta','SQL','V52__sys_attachment_image_meta.sql',66136558,'root','2026-10-09 00:05:46',1,1),
(11,'53','add logic flow menu','SQL','V53__add_logic_flow_menu.sql',-1564541405,'root','2026-10-09 00:05:46',1,1),
(12,'3','grant admin menus','SQL','V3__grant_admin_menus.sql',810571147,'root','2026-10-11 22:17:35',6,1),
(13,'4','create wf node config','SQL','V4__create_wf_node_config.sql',479091283,'root','2026-10-11 22:17:35',3,1),
(14,'5','create wf category','SQL','V5__create_wf_category.sql',1723544693,'root','2026-10-11 22:17:35',3,1),
(15,'6','create wf process draft','SQL','V6__create_wf_process_draft.sql',664068881,'root','2026-10-11 22:17:35',1,1),
(16,'7','add process management menus','SQL','V7__add_process_management_menus.sql',-2053080919,'root','2026-10-11 22:17:35',2,1),
(17,'8','add last deployed at','SQL','V8__add_last_deployed_at.sql',1003492481,'root','2026-10-11 22:17:35',7,1),
(18,'9','fix version and deployed at','SQL','V9__fix_version_and_deployed_at.sql',717164960,'root','2026-10-11 22:17:35',0,1),
(19,'11','add category menu','SQL','V11__add_category_menu.sql',840182847,'root','2026-10-11 22:17:35',1,1),
(20,'12','create form tables','SQL','V12__create_form_tables.sql',-1358903684,'root','2026-10-11 22:17:35',4,1),
(21,'13','create wf task comment','SQL','V13__create_wf_task_comment.sql',-112966394,'root','2026-10-11 22:17:35',1,1),
(22,'14','create wf task transfer','SQL','V14__create_wf_task_transfer.sql',726975210,'root','2026-10-11 22:17:35',0,1),
(23,'15','add process category permissions','SQL','V15__add_process_category_permissions.sql',894892465,'root','2026-10-11 22:17:35',1,1),
(24,'16','create wf task remind','SQL','V16__create_wf_task_remind.sql',1528080298,'root','2026-10-11 22:17:35',0,1),
(25,'17','clear form def data','SQL','V17__clear_form_def_data.sql',-1322388170,'root','2026-10-11 22:17:35',1,1),
(26,'18','add deployed config hash','SQL','V18__add_deployed_config_hash.sql',430291177,'root','2026-10-11 22:17:35',2,1),
(27,'19','form def add type and column config','SQL','V19__form_def_add_type_and_column_config.sql',230383109,'root','2026-10-11 22:17:35',3,1),
(28,'20','create wf page def','SQL','V20__create_wf_page_def.sql',333882923,'root','2026-10-11 22:17:35',4,1),
(29,'21','merge form view menus','SQL','V21__merge_form_view_menus.sql',-522814584,'root','2026-10-11 22:17:35',2,1),
(30,'22','add form id to data source','SQL','V22__add_form_id_to_data_source.sql',-1008722349,'root','2026-10-11 22:17:35',24,1),
(31,'23','add page data source id','SQL','V23__add_page_data_source_id.sql',-492092031,'root','2026-10-11 22:17:35',4,1),
(32,'24','create notification tables','SQL','V24__create_notification_tables.sql',1442754333,'root','2026-10-11 22:17:35',1,1),
(33,'25','optimize retry index','SQL','V25__optimize_retry_index.sql',1850376939,'root','2026-10-11 22:17:35',1,1),
(34,'26','add notification menus','SQL','V26__add_notification_menus.sql',2047030466,'root','2026-10-11 22:17:35',1,1),
(35,'27','unify notification tenant type','SQL','V27__unify_notification_tenant_type.sql',1390673949,'root','2026-10-11 22:17:35',5,1),
(36,'28','add message content type','SQL','V28__add_message_content_type.sql',-2141586872,'root','2026-10-11 22:17:35',1,1),
(37,'29','add notification event definitions','SQL','V29__add_notification_event_definitions.sql',-103859050,'root','2026-10-11 22:17:35',4,1),
(38,'30','add form def process key','SQL','V30__add_form_def_process_key.sql',2118263784,'root','2026-10-11 22:17:36',25,1),
(39,'31','add source key unique','SQL','V31__add_source_key_unique.sql',260739803,'root','2026-10-11 22:17:36',1,1),
(40,'32','seed workflow notification','SQL','V32__seed_workflow_notification.sql',2110666689,'root','2026-10-11 22:17:36',4,1),
(41,'47','posts member group draft box','SQL','V47__posts_member_group_draft_box.sql',1622141536,'root','2026-10-11 22:17:36',3,1),
(42,'48','node config uk version','SQL','V48__node_config_uk_version.sql',969157759,'root','2026-10-11 22:17:36',2,1),
(43,'54','serial number','SQL','V54__serial_number.sql',1470816950,'root','2026-10-11 22:17:36',1,1),
(44,'55','ai config menu','SQL','V55__ai_config_menu.sql',278095847,'root','2026-10-13 04:35:50',6,1),
(45,'56','add module menu','SQL','V56__add_module_menu.sql',-1114703309,'root','2026-10-14 18:11:56',10,1),
(46,'57','sys material','SQL','V57__sys_material.sql',725402937,'root','2026-10-20 04:07:09',9,1),
(47,'58','menu dev center','SQL','V58__menu_dev_center.sql',1132222105,'root','2026-10-20 04:07:09',8,1),
(48,'59','menu dev center order','SQL','V59__menu_dev_center_order.sql',1460111572,'root','2026-10-20 04:07:09',4,1),
(49,'60','data scope','SQL','V60__data_scope.sql',504330733,'root','2026-10-21 03:07:19',6,1),
(50,'61','row permission','SQL','V61__row_permission.sql',-56855114,'root','2026-10-21 03:07:19',4,1),
(51,'62','row scope exemption','SQL','V62__row_scope_exemption.sql',-1170162866,'root','2026-10-21 03:07:19',2,1),
(52,'63','row permission menu','SQL','V63__row_permission_menu.sql',-595049202,'root','2026-10-21 03:07:19',1,1),
(53,'64','miniprogram client identity','SQL','V64__miniprogram_client_identity.sql',359359719,'root','2026-10-21 03:07:19',1,1),
(54,'65','row scope v3','SQL','V65__row_scope_v3.sql',-1414207439,'root','2026-10-24 13:29:32',14,1),
(55,'66','row permission menu to dev','SQL','V66__row_permission_menu_to_dev.sql',1585024650,'root','2026-10-24 13:29:32',0,1),
(56,'67','home page setting','SQL','V67__home_page_setting.sql',-651823045,'root','2026-10-24 13:29:32',2,1);
/*!40000 ALTER TABLE `flyway_schema_history` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `msg_channel_config`
--

DROP TABLE IF EXISTS `msg_channel_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_channel_config` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `channel` enum('APP','IN_APP','SMS','WECHAT_MINIPROGRAM','WECHAT_WORK') NOT NULL,
  `config_key` varchar(64) NOT NULL,
  `config_value` text DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `is_encrypted` bit(1) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKn88wqw1d54i7fcsdtd7wfi4l4` (`channel`,`config_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `msg_channel_config`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `msg_channel_config` WRITE;
/*!40000 ALTER TABLE `msg_channel_config` DISABLE KEYS */;
/*!40000 ALTER TABLE `msg_channel_config` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `msg_delivery_retry`
--

DROP TABLE IF EXISTS `msg_delivery_retry`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_delivery_retry` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `channel` enum('APP','IN_APP','SMS','WECHAT_MINIPROGRAM','WECHAT_WORK') NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `last_error` text DEFAULT NULL,
  `max_retry` int(11) NOT NULL,
  `message_id` bigint(20) NOT NULL,
  `next_retry_at` datetime(6) DEFAULT NULL,
  `recipient_id` bigint(20) NOT NULL,
  `retry_count` int(11) NOT NULL,
  `status` enum('DELETED','FAILED','PENDING','READ','SENT') NOT NULL,
  `tenant_id` varchar(64) NOT NULL COMMENT 'ÁßüÊà∑ID',
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_recipient` (`recipient_id`),
  KEY `idx_next_retry` (`next_retry_at`),
  KEY `idx_retry_status_next` (`status`,`next_retry_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `msg_delivery_retry`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `msg_delivery_retry` WRITE;
/*!40000 ALTER TABLE `msg_delivery_retry` DISABLE KEYS */;
/*!40000 ALTER TABLE `msg_delivery_retry` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `msg_event_definition`
--

DROP TABLE IF EXISTS `msg_event_definition`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_event_definition` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `business_domain` varchar(64) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL,
  `created_by` varchar(64) NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `enabled` bit(1) NOT NULL,
  `event_code` varchar(64) NOT NULL,
  `event_name` varchar(128) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKolg4hnibtg7ilx604d443v28s` (`tenant_id`,`event_code`),
  KEY `idx_event_tenant_enabled` (`tenant_id`,`enabled`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `msg_event_definition`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `msg_event_definition` WRITE;
/*!40000 ALTER TABLE `msg_event_definition` DISABLE KEYS */;
INSERT INTO `msg_event_definition` VALUES
(1,'WORKFLOW','2026-10-11 22:17:36.000000','system','Áî®Êà∑‰ªªÂä°ÂàÜÈÖçÁªôÂäûÁêÜ‰∫∫Êó∂Êé®ÈÄÅÂæÖÂäûÈÄöÁü•',0x01,'WF_TASK_ASSIGNED','Â∑•‰ΩúÊµÅ‰ªªÂä°ÂæÖÂäû','default','2026-10-11 22:17:36.000000',NULL),
(2,'WORKFLOW','2026-10-11 22:17:36.000000','system','ÊµÅÁ®ãÂÆû‰æãÂÖ®ÈÉ®ÂÆ°ÊâπÂÆåÊàêÊó∂ÈÄöÁü•ÂèëËµ∑‰∫∫',0x01,'WF_PROCESS_FINISHED','Â∑•‰ΩúÊµÅÂäûÁªìÈÄöÁü•','default','2026-10-11 22:17:36.000000',NULL),
(3,'WORKFLOW','2026-10-11 22:17:36.000000','system','ÂèëËµ∑‰∫∫ÂØπÂæÖÂäû‰ªªÂä°ÂèëËµ∑ÂÇ¨ÂäûÊó∂ÈÄöÁü•ÂäûÁêÜ‰∫∫',0x01,'WF_TASK_REMINDED','Â∑•‰ΩúÊµÅÂÇ¨ÂäûÈÄöÁü•','default','2026-10-11 22:17:36.000000',NULL);
/*!40000 ALTER TABLE `msg_event_definition` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `msg_message`
--

DROP TABLE IF EXISTS `msg_message`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_message` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `category` enum('APPROVAL','NOTIFICATION','SYSTEM','TASK','WORKFLOW') DEFAULT NULL,
  `content` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`content`)),
  `content_type` enum('MARKDOWN','TEXT') DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `event_code` varchar(64) DEFAULT NULL,
  `link_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`link_json`)),
  `message_type` enum('PRIVATE','PUBLIC','SYSTEM') DEFAULT NULL,
  `priority` enum('HIGH','LOW','NORMAL','URGENT') DEFAULT NULL,
  `sender_id` bigint(20) NOT NULL,
  `sender_type` varchar(32) NOT NULL,
  `status` enum('DELETED','FAILED','PENDING','READ','SENT') DEFAULT NULL,
  `template_code` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL COMMENT 'ÁßüÊà∑ID',
  `title` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tenant` (`tenant_id`),
  KEY `idx_template` (`template_code`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `msg_message`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `msg_message` WRITE;
/*!40000 ALTER TABLE `msg_message` DISABLE KEYS */;
/*!40000 ALTER TABLE `msg_message` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `msg_recipient`
--

DROP TABLE IF EXISTS `msg_recipient`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_recipient` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `channel` enum('APP','IN_APP','SMS','WECHAT_MINIPROGRAM','WECHAT_WORK') NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `message_id` bigint(20) NOT NULL,
  `nickname` varchar(64) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `sent_at` datetime(6) DEFAULT NULL,
  `status` enum('DELIVERED','FAILED','PENDING','READ','SENT') NOT NULL,
  `tenant_id` varchar(64) NOT NULL COMMENT 'ÁßüÊà∑ID',
  `user_id` bigint(20) NOT NULL,
  `username` varchar(64) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_message` (`message_id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_channel` (`channel`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `msg_recipient`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `msg_recipient` WRITE;
/*!40000 ALTER TABLE `msg_recipient` DISABLE KEYS */;
/*!40000 ALTER TABLE `msg_recipient` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `msg_subscription_rule`
--

DROP TABLE IF EXISTS `msg_subscription_rule`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_subscription_rule` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `action` enum('ALLOW','DENY','FORCE') NOT NULL,
  `channel` enum('APP','IN_APP','SMS','WECHAT_MINIPROGRAM','WECHAT_WORK') NOT NULL,
  `condition_expr` text DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(64) DEFAULT NULL,
  `enable` bit(1) NOT NULL,
  `event_code` varchar(64) NOT NULL,
  `priority` enum('HIGH','LOW','NORMAL','URGENT') DEFAULT NULL,
  `tenant_id` varchar(64) NOT NULL COMMENT 'ÁßüÊà∑ID',
  PRIMARY KEY (`id`),
  KEY `idx_event_channel` (`event_code`,`channel`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `msg_subscription_rule`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `msg_subscription_rule` WRITE;
/*!40000 ALTER TABLE `msg_subscription_rule` DISABLE KEYS */;
/*!40000 ALTER TABLE `msg_subscription_rule` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `msg_template`
--

DROP TABLE IF EXISTS `msg_template`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_template` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `category` enum('APPROVAL','NOTIFICATION','SYSTEM','TASK','WORKFLOW') DEFAULT NULL,
  `channel` enum('APP','IN_APP','SMS','WECHAT_MINIPROGRAM','WECHAT_WORK') DEFAULT NULL,
  `content` text DEFAULT NULL,
  `content_type` enum('MARKDOWN','TEXT') DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `enabled` bit(1) NOT NULL,
  `event_code` varchar(64) DEFAULT NULL,
  `is_system` bit(1) NOT NULL,
  `name` varchar(128) NOT NULL,
  `priority` enum('HIGH','LOW','NORMAL','URGENT') DEFAULT NULL,
  `template_code` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL COMMENT 'ÁßüÊà∑ID',
  `title` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_template` (`tenant_id`,`template_code`),
  KEY `idx_channel` (`channel`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `msg_template`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `msg_template` WRITE;
/*!40000 ALTER TABLE `msg_template` DISABLE KEYS */;
INSERT INTO `msg_template` VALUES
(1,'WORKFLOW','IN_APP','ÊµÅÁ®ã„Äå${processName}„ÄçÂ∑≤ÊµÅËΩ¨Ëá≥ËäÇÁÇπ„Äå${taskName}„ÄçÔºåÂèëËµ∑‰∫∫Ôºö${initiatorName}ÔºåËØ∑ÂèäÊó∂Â§ÑÁêÜ„ÄÇ','TEXT','2026-10-11 22:17:36.000000',0x01,NULL,0x01,'Â∑•‰ΩúÊµÅ-‰ªªÂä°ÂæÖÂäûÈÄöÁü•','NORMAL','TPL_WF_TASK_ASSIGNED','default','ÊÇ®ÊúâÊñ∞ÁöÑÂæÖÂäû‰ªªÂä°Ôºö${taskName}'),
(2,'WORKFLOW','IN_APP','ÊÇ®ÂèëËµ∑ÁöÑÊµÅÁ®ã„Äå${processName}„ÄçÔºàÂçïÂè∑Ôºö${businessKey}ÔºâÂ∑≤ÂÖ®ÈÉ®ÂÆ°ÊâπÂÆåÊàê„ÄÇ','TEXT','2026-10-11 22:17:36.000000',0x01,NULL,0x01,'Â∑•‰ΩúÊµÅ-ÂäûÁªìÈÄöÁü•','NORMAL','TPL_WF_PROCESS_FINISHED','default','ÊÇ®ÁöÑÊµÅÁ®ã„Äå${processName}„ÄçÂ∑≤ÂäûÁªì'),
(3,'WORKFLOW','IN_APP','${senderName} ÂÇ¨‰øÉÊÇ®Â∞ΩÂø´Â§ÑÁêÜÊµÅÁ®ã„Äå${processName}„Äç‰∏≠ÁöÑ‰ªªÂä°„Äå${taskName}„Äç„ÄÇ','TEXT','2026-10-11 22:17:36.000000',0x01,NULL,0x01,'Â∑•‰ΩúÊµÅ-ÂÇ¨ÂäûÈÄöÁü•','NORMAL','TPL_WF_TASK_REMINDED','default','ÂÇ¨ÂäûÊèêÈÜíÔºö${taskName}');
/*!40000 ALTER TABLE `msg_template` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `msg_user_subscription`
--

DROP TABLE IF EXISTS `msg_user_subscription`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_user_subscription` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `channel` enum('APP','IN_APP','SMS','WECHAT_MINIPROGRAM','WECHAT_WORK') NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `subscribed` bit(1) NOT NULL,
  `tenant_id` varchar(64) NOT NULL COMMENT 'ÁßüÊà∑ID',
  `updated_at` datetime(6) DEFAULT NULL,
  `user_id` bigint(20) NOT NULL,
  `username` varchar(64) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKsb3us05nvffs56bh1xr5uxjvu` (`tenant_id`,`user_id`,`channel`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `msg_user_subscription`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `msg_user_subscription` WRITE;
/*!40000 ALTER TABLE `msg_user_subscription` DISABLE KEYS */;
/*!40000 ALTER TABLE `msg_user_subscription` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_ai_config`
--

DROP TABLE IF EXISTS `sys_ai_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_ai_config` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `is_deleted` int(11) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `api_key` varchar(512) DEFAULT NULL,
  `base_url` varchar(512) NOT NULL,
  `connect_timeout_ms` int(11) NOT NULL,
  `enabled` bit(1) NOT NULL,
  `max_tokens` int(11) DEFAULT NULL,
  `model` varchar(128) NOT NULL,
  `read_timeout_ms` int(11) NOT NULL,
  `temperature` double DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_ai_config`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_ai_config` WRITE;
/*!40000 ALTER TABLE `sys_ai_config` DISABLE KEYS */;
/*!40000 ALTER TABLE `sys_ai_config` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_attachment`
--

DROP TABLE IF EXISTS `sys_attachment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_attachment` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `file_name` varchar(500) NOT NULL COMMENT 'ÂéüÂßãÊñá‰ª∂ÂêçÔºàÂ±ïÁ§∫Áî®Ôºâ',
  `stored_name` varchar(128) NOT NULL COMMENT 'Â≠òÂÇ®Êñá‰ª∂ÂêçÔºàuuid.extÔºåÊúçÂä°Á´ØÁîüÊàêÔºâ',
  `content_type` varchar(255) DEFAULT NULL COMMENT 'MIME Á±ªÂûã',
  `file_size` bigint(20) NOT NULL DEFAULT 0 COMMENT 'Êñá‰ª∂Â≠óËäÇÊï∞',
  `storage_path` varchar(500) NOT NULL COMMENT 'Áõ∏ÂØπ storage-path ÁöÑÂ≠êË∑ØÂæÑÔºàyyyy/MM/uuid.extÔºâ',
  `biz_type` varchar(50) DEFAULT NULL COMMENT '‰∏öÂä°ÂΩíÁ±ªÔºàÈ¢ÑÁïôÔºöform/page/...Ôºâ',
  `biz_ref` varchar(64) DEFAULT NULL COMMENT '‰∏öÂä°ÂºïÁî®Ê†áËØÜÔºàÈ¢ÑÁïôÔºâ',
  `is_deleted` int(11) NOT NULL DEFAULT 0,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `img_width` int(11) DEFAULT NULL COMMENT 'ÂõæÁâáÂÆΩÂ∫¶ pxÔºà‰ªÖ upload-image ‰∏î‰ΩçÂõæËß£Á†ÅÊàêÂäüÊó∂ÊúâÂÄºÔºâ',
  `img_height` int(11) DEFAULT NULL COMMENT 'ÂõæÁâáÈ´òÂ∫¶ pxÔºàÂêå‰∏äÔºâ',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sys_attachment_stored_name` (`stored_name`),
  KEY `idx_sys_attachment_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Á≥ªÁªüÁªÑ‰ª∂¬∑ÈôÑ‰ª∂ÂÖÉÊï∞ÊçÆÔºàTask 146Ôºâ';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_attachment`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_attachment` WRITE;
/*!40000 ALTER TABLE `sys_attachment` DISABLE KEYS */;
/*!40000 ALTER TABLE `sys_attachment` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_dict_data`
--

DROP TABLE IF EXISTS `sys_dict_data`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_dict_data` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `is_deleted` int(11) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `dict_code` varchar(50) NOT NULL,
  `label` varchar(100) NOT NULL,
  `sort_order` int(11) DEFAULT NULL,
  `status` int(11) NOT NULL,
  `value` varchar(100) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9008 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_dict_data`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_dict_data` WRITE;
/*!40000 ALTER TABLE `sys_dict_data` DISABLE KEYS */;
INSERT INTO `sys_dict_data` VALUES
(9001,'2026-10-11 14:09:18.247661',NULL,0,'2026-10-11 14:09:18.247677',NULL,'customer_level','ÈáçË¶ÅÂÆ¢Êà∑',1,1,'A'),
(9002,'2026-10-11 14:09:18.268103',NULL,0,'2026-10-11 14:09:18.268114',NULL,'customer_level','ÊôÆÈÄöÂÆ¢Êà∑',2,1,'B'),
(9003,'2026-10-11 14:09:18.310523',NULL,0,'2026-10-11 14:09:18.310536',NULL,'customer_level','ÊΩúÂú®ÂÆ¢Êà∑',3,1,'C'),
(9004,'2026-10-11 14:15:15.206038',NULL,0,'2026-10-11 14:15:15.206051',NULL,'service_type','ÂÆâË£ÖË∞ÉËØï',0,1,'install'),
(9005,'2026-10-11 14:15:15.218800',NULL,0,'2026-10-11 14:15:15.218826',NULL,'service_type','ÂÆöÊúüÂ∑°Ê£Ä',1,1,'patrol'),
(9006,'2026-10-11 14:15:15.237576',NULL,0,'2026-10-11 14:15:15.237587',NULL,'service_type','ÊïÖÈöúÁª¥‰øÆ',2,1,'repair'),
(9007,'2026-10-11 14:15:15.247042',NULL,0,'2026-10-11 14:15:15.247053',NULL,'service_type','ÂüπËÆ≠ÊîØÊåÅ',3,1,'training');
/*!40000 ALTER TABLE `sys_dict_data` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_dict_type`
--

DROP TABLE IF EXISTS `sys_dict_type`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_dict_type` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `is_deleted` int(11) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `dict_code` varchar(50) NOT NULL,
  `dict_name` varchar(100) NOT NULL,
  `remark` varchar(255) DEFAULT NULL,
  `status` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKn09exsucyqm2v79fwvep1wtn9` (`dict_code`)
) ENGINE=InnoDB AUTO_INCREMENT=9003 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_dict_type`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_dict_type` WRITE;
/*!40000 ALTER TABLE `sys_dict_type` DISABLE KEYS */;
INSERT INTO `sys_dict_type` VALUES
(9001,'2026-10-11 14:09:18.187864',NULL,0,'2026-10-11 14:09:18.187879',NULL,'customer_level','ÂÆ¢Êà∑Á≠âÁ∫ß','ÁªÑ‰ª∂ÊºîÁ§∫-ÂÆ¢Êà∑Á≠âÁ∫ßÂ≠óÂÖ∏',1),
(9002,'2026-10-11 14:15:15.185083',NULL,0,'2026-10-11 14:15:15.185097',NULL,'service_type','ÊúçÂä°Á±ªÂûã',NULL,1);
/*!40000 ALTER TABLE `sys_dict_type` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_home_page_setting`
--

DROP TABLE IF EXISTS `sys_home_page_setting`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_home_page_setting` (
  `tenant_id` varchar(64) NOT NULL,
  `page_key` varchar(255) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_home_page_setting`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_home_page_setting` WRITE;
/*!40000 ALTER TABLE `sys_home_page_setting` DISABLE KEYS */;
/*!40000 ALTER TABLE `sys_home_page_setting` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_material`
--

DROP TABLE IF EXISTS `sys_material`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_material` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `is_deleted` int(11) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `file_size` bigint(20) NOT NULL,
  `manifest_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`manifest_json`)),
  `material_key` varchar(100) NOT NULL,
  `name` varchar(200) NOT NULL,
  `sdk_version` varchar(20) NOT NULL,
  `status` int(11) NOT NULL,
  `storage_path` varchar(500) NOT NULL,
  `stored_name` varchar(128) NOT NULL,
  `type` varchar(20) NOT NULL,
  `version` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sys_material_key` (`material_key`),
  KEY `idx_sys_material_type` (`type`),
  KEY `idx_sys_material_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_material`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_material` WRITE;
/*!40000 ALTER TABLE `sys_material` DISABLE KEYS */;
/*!40000 ALTER TABLE `sys_material` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_member_group`
--

DROP TABLE IF EXISTS `sys_member_group`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_member_group` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `group_name` varchar(64) NOT NULL COMMENT 'ÊàêÂëòÁªÑÂêçÁß∞',
  `description` varchar(255) DEFAULT NULL COMMENT 'ËØ¥Êòé',
  `status` int(11) NOT NULL DEFAULT 1 COMMENT '1 ÂêØÁî® / 0 ÂÅúÁî®',
  `is_deleted` int(11) NOT NULL DEFAULT 0,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sys_member_group_name` (`group_name`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ÊàêÂëòÁªÑ‰∏ªÊï∞ÊçÆ';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_member_group`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_member_group` WRITE;
/*!40000 ALTER TABLE `sys_member_group` DISABLE KEYS */;
INSERT INTO `sys_member_group` VALUES
(1,'È°πÁõÆÁÆ°ÁêÜÁªÑ','È°πÁõÆÁ´ãÈ°π„ÄÅËØÑÂÆ°„ÄÅÈ™åÊî∂Áõ∏ÂÖ≥ÊµÅÁ®ãÁöÑÂÆ°ÊâπÂçèÂêåÁªÑ',1,0,'system','2026-10-09 00:05:46.268000',NULL,'2026-10-09 00:05:46.268000'),
(2,'ËøêÁª¥ÂÄºÁè≠ÁªÑ','Á≥ªÁªüÂÄºÁè≠‰∏éÂëäË≠¶Â§ÑÁêÜÈÄöÁü•ÁªÑ',1,0,'system','2026-10-09 00:05:46.269000',NULL,'2026-10-09 00:05:46.269000'),
(3,'ÂÆ¢Êà∑','Â∞èÁ®ãÂ∫èÂÆ¢Êà∑Á´ØÁî®Êà∑Êù•Ê∫êÊ†áËÆ∞ÔºàP0.4Ôºâ',1,0,'system','2026-10-21 03:07:19.148000',NULL,'2026-10-21 03:07:19.148000');
/*!40000 ALTER TABLE `sys_member_group` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_member_group_member`
--

DROP TABLE IF EXISTS `sys_member_group_member`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_member_group_member` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `group_id` bigint(20) NOT NULL COMMENT 'ÊàêÂëòÁªÑ id',
  `user_id` bigint(20) NOT NULL COMMENT 'Áî®Êà∑ id',
  `is_deleted` int(11) NOT NULL DEFAULT 0,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_member_group_user` (`group_id`,`user_id`),
  KEY `idx_member_group_user` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ÊàêÂëòÁªÑÊàêÂëòÂÖ≥Á≥ªÔºàÊâãÂä®Ê∑ªÂä†ÔºåËßÑÂàôÊú∫Âà∂Â∑≤ÁßªÈô§Ôºâ';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_member_group_member`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_member_group_member` WRITE;
/*!40000 ALTER TABLE `sys_member_group_member` DISABLE KEYS */;
INSERT INTO `sys_member_group_member` VALUES
(1,1,1,0,'system','2026-10-09 00:05:46.269000','2026-10-09 00:05:46.269000',NULL),
(2,1,2,0,'system','2026-10-09 00:05:46.269000','2026-10-09 00:05:46.269000',NULL);
/*!40000 ALTER TABLE `sys_member_group_member` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_menu`
--

DROP TABLE IF EXISTS `sys_menu`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_menu` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `is_deleted` int(11) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `component` varchar(255) DEFAULT NULL,
  `icon` varchar(50) DEFAULT NULL,
  `menu_name` varchar(100) NOT NULL,
  `menu_type` int(11) NOT NULL,
  `parent_id` bigint(20) DEFAULT NULL,
  `path` varchar(200) DEFAULT NULL,
  `permission` varchar(100) DEFAULT NULL,
  `sort_order` int(11) DEFAULT NULL,
  `status` int(11) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9320 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_menu`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_menu` WRITE;
/*!40000 ALTER TABLE `sys_menu` DISABLE KEYS */;
INSERT INTO `sys_menu` VALUES
(1,'2026-09-11 10:30:10.000000',NULL,0,'2026-10-20 04:07:09.383000',NULL,NULL,'Setting','Á≥ªÁªüÁÆ°ÁêÜ',0,NULL,'/system',NULL,3,1),
(2,'2026-09-11 10:30:10.000000',NULL,0,'2026-10-20 04:07:09.381000',NULL,'system/user/index','User','Áî®Êà∑ÁÆ°ÁêÜ',1,1,'/system/user','system:user:list',1,1),
(3,'2026-09-11 10:30:10.000000',NULL,0,'2026-10-20 04:07:09.381000',NULL,'system/role/index','UserFilled','ËßíËâ≤ÁÆ°ÁêÜ',1,1,'/system/role','system:role:list',2,1),
(4,'2026-09-11 10:30:10.000000',NULL,0,'2026-10-20 04:07:09.398000',NULL,'system/menu/index','Menu','ËèúÂçïÁÆ°ÁêÜ',1,180,'/system/menu','system:menu:list',1,1),
(5,'2026-09-11 10:30:10.000000',NULL,0,'2026-10-20 04:07:09.381000',NULL,'system/org/index','Organization','ÁªÑÁªáÊú∫ÊûÑ',1,1,'/system/org','system:org:list',3,1),
(6,'2026-09-11 10:30:10.000000',NULL,0,'2026-10-20 04:07:09.381000',NULL,'system/dict/index','List','Â≠óÂÖ∏ÁÆ°ÁêÜ',1,1,'/system/dict','system:dict:list',4,1),
(7,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,'dashboard/index','HomeFilled','È¶ñÈ°µ',1,NULL,'/dashboard',NULL,0,1),
(8,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'Áî®Êà∑Êü•ËØ¢',2,2,NULL,'system:user:query',1,1),
(9,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'Áî®Êà∑Êñ∞Â¢û',2,2,NULL,'system:user:create',2,1),
(10,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'Áî®Êà∑‰øÆÊîπ',2,2,NULL,'system:user:update',3,1),
(11,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'Áî®Êà∑Âà†Èô§',2,2,NULL,'system:user:delete',4,1),
(12,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'ËßíËâ≤Êü•ËØ¢',2,3,NULL,'system:role:query',1,1),
(13,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'ËßíËâ≤Êñ∞Â¢û',2,3,NULL,'system:role:create',2,1),
(14,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'ËßíËâ≤‰øÆÊîπ',2,3,NULL,'system:role:update',3,1),
(15,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'ËßíËâ≤Âà†Èô§',2,3,NULL,'system:role:delete',4,1),
(16,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'ËèúÂçïÊü•ËØ¢',2,4,NULL,'system:menu:query',1,1),
(17,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'ËèúÂçïÊñ∞Â¢û',2,4,NULL,'system:menu:create',2,1),
(18,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'ËèúÂçï‰øÆÊîπ',2,4,NULL,'system:menu:update',3,1),
(19,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'ËèúÂçïÂà†Èô§',2,4,NULL,'system:menu:delete',4,1),
(20,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'Êú∫ÊûÑÊü•ËØ¢',2,5,NULL,'system:org:query',1,1),
(21,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'Êú∫ÊûÑÊñ∞Â¢û',2,5,NULL,'system:org:create',2,1),
(22,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'Êú∫ÊûÑ‰øÆÊîπ',2,5,NULL,'system:org:update',3,1),
(23,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'Êú∫ÊûÑÂà†Èô§',2,5,NULL,'system:org:delete',4,1),
(24,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'Â≠óÂÖ∏Êü•ËØ¢',2,6,NULL,'system:dict:query',1,1),
(25,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'Â≠óÂÖ∏Êñ∞Â¢û',2,6,NULL,'system:dict:create',2,1),
(26,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'Â≠óÂÖ∏‰øÆÊîπ',2,6,NULL,'system:dict:update',3,1),
(27,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'Â≠óÂÖ∏Âà†Èô§',2,6,NULL,'system:dict:delete',4,1),
(100,'2026-09-11 10:30:10.000000',NULL,0,'2026-10-20 04:07:09.383000',NULL,NULL,'Operation','ÊµÅÁ®ãÁÆ°ÁêÜ',0,NULL,'/process',NULL,4,1),
(101,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,'process/ProcessListPage','Document','ÊµÅÁ®ãÂÆö‰πâ',1,100,'/process/definition','process:definition:list',1,1),
(102,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,'process/ProcessCenterPage','Files','ÊµÅÁ®ã‰∏≠ÂøÉ',1,100,'/process/center','process:center:list',2,1),
(103,'2026-09-11 10:30:10.000000',NULL,0,'2026-10-11 22:17:36.024402',NULL,'process/ProcessTodoPage','BellFilled','ÂæÖÂäûÂ§ÑÁêÜ',1,100,'/process/todo','process:todo:list',4,1),
(104,'2026-10-11 22:17:36.024142',NULL,0,'2026-10-11 22:17:36.024142',NULL,'process/ProcessDraftBoxPage','Collection','ËçâÁ®øÁÆ±',1,100,'/process/drafts','process:draft:list',3,1),
(110,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'ÊµÅÁ®ãÂàõÂª∫',2,101,NULL,'process:definition:create',1,1),
(111,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'ÊµÅÁ®ãÈÉ®ÁΩ≤',2,101,NULL,'process:definition:deploy',2,1),
(112,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'ÊµÅÁ®ãÂà†Èô§',2,101,NULL,'process:definition:delete',3,1),
(113,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'ÂàÜÁ±ªÂàõÂª∫',2,104,NULL,'process:category:create',1,1),
(114,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'ÂàÜÁ±ªÁºñËæë',2,104,NULL,'process:category:update',2,1),
(115,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'ÂàÜÁ±ªÂà†Èô§',2,104,NULL,'process:category:delete',3,1),
(120,'2026-09-11 10:30:10.000000',NULL,1,'2026-10-11 22:17:35.000000',NULL,NULL,'Tickets','Ë°®ÂçïÁÆ°ÁêÜ',0,NULL,'/form',NULL,3,0),
(121,'2026-09-11 10:30:10.000000',NULL,0,'2026-10-20 04:07:09.398000',NULL,'form/FormListPage','Document','Ë°®ÂçïÂàóË°®',1,180,'/form','form:list',2,1),
(130,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'Ë°®ÂçïÂàõÂª∫',2,121,NULL,'form:create',1,1),
(131,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'Ë°®ÂçïÁºñËæë',2,121,NULL,'form:edit',2,1),
(132,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'Ë°®ÂçïÂèëÂ∏É',2,121,NULL,'form:publish',3,1),
(133,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'Ë°®ÂçïÂà†Èô§',2,121,NULL,'form:delete',4,1),
(140,'2026-09-11 10:30:10.000000',NULL,1,'2026-10-11 22:17:35.000000',NULL,NULL,'Grid','Êü•ËØ¢ÁïåÈù¢ÁÆ°ÁêÜ',0,NULL,'/page',NULL,4,0),
(141,'2026-09-11 10:30:10.000000',NULL,0,'2026-10-20 04:07:09.398000',NULL,'page/PageListPage','Document','È°µÈù¢ÂàóË°®',1,180,'/page','page:list',3,1),
(142,'2026-09-11 10:30:10.000000',NULL,0,'2026-10-20 04:07:09.398000',NULL,'dataSource/DataSourceListPage','Connection','Êï∞ÊçÆÊ∫êÁÆ°ÁêÜ',1,180,'/data-source/list','data-source:list',4,1),
(150,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'È°µÈù¢ÂàõÂª∫',2,141,NULL,'page:create',1,1),
(151,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'È°µÈù¢ÁºñËæë',2,141,NULL,'page:edit',2,1),
(152,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'È°µÈù¢ÂèëÂ∏É',2,141,NULL,'page:publish',3,1),
(153,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'È°µÈù¢Âà†Èô§',2,141,NULL,'page:delete',4,1),
(154,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'Êï∞ÊçÆÊ∫êÁÆ°ÁêÜ',2,142,NULL,'data-source:manage',1,1),
(160,'2026-09-11 10:30:10.000000',NULL,1,'2026-10-20 04:07:09.384000',NULL,NULL,'Grid','Ë°®ÂçïËßÜÂõæÁÆ°ÁêÜ',0,NULL,'/form',NULL,3,1),
(170,'2026-10-09 00:05:46.301000',NULL,1,'2026-10-20 04:07:09.384000',NULL,NULL,'Share','ÈÄªËæëÁºñÊéí',0,NULL,'/logic',NULL,4,1),
(171,'2026-10-09 00:05:46.302000',NULL,0,'2026-10-20 04:07:09.399000',NULL,'logicflow/LogicFlowListPage','Cpu','ÈÄªËæëÊµÅ',1,180,'/logic-flow','logicflow:list',5,1),
(172,'2026-10-14 18:11:56.273000',NULL,0,'2026-10-20 04:07:09.399000',NULL,'module/ModuleListPage','Box','Ê®°ÂùóÁÆ°ÁêÜ',1,180,'/module','module:manage',6,1),
(180,'2026-10-20 04:07:09.378000',NULL,0,'2026-10-20 04:07:09.383000',NULL,NULL,'Tools','ÂºÄÂèëÁÆ°ÁêÜ',0,NULL,'/dev',NULL,1,1),
(190,'2026-10-20 04:07:09.379000',NULL,0,'2026-10-20 04:07:09.383000',NULL,NULL,'Notebook','Ê†∑‰æãÈ°µÈù¢',0,NULL,'/samples',NULL,2,1),
(250,'2026-09-11 10:30:10.000000',NULL,0,'2026-10-20 04:07:09.384000',NULL,NULL,'Bell','Ê∂àÊÅØÁÆ°ÁêÜ',0,NULL,'/messages',NULL,5,1),
(251,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,'modules/notification/views/MessageCenter','Message','Ê∂àÊÅØ‰∏≠ÂøÉ',1,250,'/messages','notification:message:list',1,1),
(252,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,'modules/notification/views/admin/TemplateList','Document','Ê®°ÊùøÁÆ°ÁêÜ',1,250,'/messages/templates','notification:template:list',2,1),
(253,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,'modules/notification/views/admin/ChannelConfig','Connection','Ê∏†ÈÅìÈÖçÁΩÆ',1,250,'/messages/channels','notification:channel:list',3,1),
(254,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,'modules/notification/views/admin/SubscriptionRules','SetUp','ËÆ¢ÈòÖËßÑÂàô',1,250,'/messages/subscriptions','notification:subscription:list',4,1),
(255,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,'modules/notification/views/admin/DeliveryLog','Tickets','ÂèëÈÄÅËÆ∞ÂΩï',1,250,'/messages/deliveries','notification:delivery:list',5,1),
(256,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'Ê®°ÊùøÁÆ°ÁêÜ',2,252,NULL,'notification:template:manage',1,1),
(257,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'Ê∏†ÈÅìÈÖçÁΩÆ',2,253,NULL,'notification:channel:manage',1,1),
(258,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'ËÆ¢ÈòÖËßÑÂàô',2,254,NULL,'notification:subscription:manage',1,1),
(259,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'ÂèëÈÄÅËÆ∞ÂΩïÈáçÂèë',2,255,NULL,'notification:delivery:retry',1,1),
(260,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,'modules/notification/views/admin/AnnouncementList','Notification','ÂÖ¨ÂëäÁÆ°ÁêÜ',1,250,'/messages/announcements','notification:announcement:list',6,1),
(261,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,'modules/notification/views/admin/EventDefinitionList','Operation','‰∫ã‰ª∂ÁÆ°ÁêÜ',1,250,'/messages/events','notification:event:list',7,1),
(262,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'ÂÖ¨ÂëäÁÆ°ÁêÜ',2,260,NULL,'notification:announcement:manage',1,1),
(263,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'‰∫ã‰ª∂ÁÆ°ÁêÜ',2,261,NULL,'notification:event:manage',1,1),
(300,'2026-10-09 00:05:46.249000',NULL,0,'2026-10-20 04:07:09.381000',NULL,'system/post/PostPage','User','Â≤ó‰ΩçÁÆ°ÁêÜ',1,1,'/system/post','system:post:list',5,1),
(301,'2026-10-11 22:17:36.024653',NULL,0,'2026-10-11 22:17:36.024653',NULL,NULL,NULL,'Â≤ó‰ΩçÊü•ËØ¢',2,300,NULL,'system:post:query',1,1),
(302,'2026-10-11 22:17:36.024653',NULL,0,'2026-10-11 22:17:36.024653',NULL,NULL,NULL,'Â≤ó‰ΩçÊñ∞Â¢û',2,300,NULL,'system:post:create',2,1),
(303,'2026-10-11 22:17:36.024653',NULL,0,'2026-10-11 22:17:36.024653',NULL,NULL,NULL,'Â≤ó‰Ωç‰øÆÊîπ',2,300,NULL,'system:post:update',3,1),
(304,'2026-09-15 18:42:37.587603',NULL,0,'2026-09-15 18:42:37.587603',NULL,'page/PageRenderer',NULL,'ÊºîÁ§∫È°µÈù¢',1,160,'/page/test_page','page:read:test_page',0,1),
(305,'2026-10-09 00:05:46.250000',NULL,0,'2026-10-20 04:07:09.381000',NULL,'system/member-group/MemberGroupPage','Connection','ÊàêÂëòÁªÑÁÆ°ÁêÜ',1,1,'/system/member-group','system:member-group:list',6,1),
(306,'2026-10-03 01:29:54.395845',NULL,0,'2026-10-03 01:29:54.395861',NULL,'page/PageRenderer',NULL,'‰∏ªÈ°µ‰ª™Ë°®Áõò',1,NULL,'/page/dashboard','page:read:dashboard',0,1),
(312,'2026-10-09 00:05:46.270000',NULL,0,'2026-10-09 00:05:46.270000',NULL,NULL,NULL,'ÊàêÂëòÁªÑÊü•ËØ¢',2,305,NULL,'system:member-group:query',1,1),
(313,'2026-10-09 00:05:46.270000',NULL,0,'2026-10-09 00:05:46.270000',NULL,NULL,NULL,'ÊàêÂëòÁªÑÊñ∞Â¢û',2,305,NULL,'system:member-group:create',2,1),
(314,'2026-10-09 00:05:46.270000',NULL,0,'2026-10-09 00:05:46.270000',NULL,NULL,NULL,'ÊàêÂëòÁªÑ‰øÆÊîπ',2,305,NULL,'system:member-group:update',3,1),
(315,'2026-10-09 00:05:46.271000',NULL,0,'2026-10-09 00:05:46.271000',NULL,NULL,NULL,'ÊàêÂëòÁªÑÂà†Èô§',2,305,NULL,'system:member-group:delete',4,1),
(316,'2026-10-09 00:05:46.271000',NULL,0,'2026-10-09 00:05:46.271000',NULL,NULL,NULL,'ÊàêÂëòÁª¥Êä§',2,305,NULL,'system:member-group:member',5,1),
(320,'2026-10-13 04:35:50.662000',NULL,0,'2026-10-20 04:07:09.382000',NULL,'system/ai-config/AiConfigPage','Cpu','Ê®°ÂûãÈÖçÁΩÆ',1,1,'/system/ai-config','system:aiconfig:list',7,1),
(321,'2026-10-20 04:07:09.328000',NULL,0,'2026-10-20 04:07:09.399000',NULL,'material/MaterialListPage','Files','Áâ©ÊñôÁÆ°ÁêÜ',1,180,'/material','material:manage',7,1),
(322,'2026-10-21 03:07:19.136000',NULL,0,'2026-10-24 13:29:32.868000',NULL,'system/row-permission/RowPermissionPage','Lock','Êï∞ÊçÆÊùÉÈôê',1,180,'/system/row-permission','system:rowpermission:list',7,1),
(9319,'2026-10-11 15:19:25.498182',NULL,0,'2026-10-20 04:07:09.381000',NULL,'page/PageRenderer',NULL,'ÁªÑ‰ª∂ÊºîÁ§∫¬∑Êï∞ÊçÆËØ¶ÊÉÖ‰∏éÊ≠•È™§Êù°',1,190,'/page/page_detail_steps_demo','page:read:page_detail_steps_demo',1,1);
/*!40000 ALTER TABLE `sys_menu` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_organization`
--

DROP TABLE IF EXISTS `sys_organization`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_organization` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `is_deleted` int(11) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `org_code` varchar(50) NOT NULL,
  `org_name` varchar(100) NOT NULL,
  `parent_id` bigint(20) DEFAULT NULL,
  `sort_order` int(11) DEFAULT NULL,
  `status` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK1dm1ss9gn66mtn1m0dyb9bsyp` (`org_code`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_organization`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_organization` WRITE;
/*!40000 ALTER TABLE `sys_organization` DISABLE KEYS */;
INSERT INTO `sys_organization` VALUES
(1,'2026-09-11 14:56:10.024480',NULL,0,'2026-09-11 14:56:10.024480',NULL,'01','ÊÄªÂÖ¨Âè∏',NULL,0,1),
(2,'2026-09-11 14:56:39.609039',NULL,0,'2026-09-11 14:56:39.609039',NULL,'0101','Ê≠¶Ê±âÂàÜÂÖ¨Âè∏',1,1,1),
(3,'2026-09-11 14:57:09.187390',NULL,0,'2026-09-11 14:57:09.187390',NULL,'0102','Âåó‰∫¨ÂàÜÂÖ¨Âè∏',1,2,1),
(4,'2026-09-11 14:57:40.732142',NULL,0,'2026-09-11 15:19:18.297269',NULL,'0103','Êµ∑ÂçóÂàÜÂÖ¨Âè∏',1,3,1);
/*!40000 ALTER TABLE `sys_organization` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_post`
--

DROP TABLE IF EXISTS `sys_post`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_post` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `post_code` varchar(64) NOT NULL COMMENT 'Â≤ó‰ΩçÁºñÁ†ÅÔºàÂîØ‰∏ÄÔºâ',
  `post_name` varchar(64) NOT NULL,
  `description` varchar(255) DEFAULT NULL COMMENT 'ÊèèËø∞',
  `sort_order` int(11) DEFAULT NULL COMMENT 'ÊéíÂ∫è',
  `status` int(11) NOT NULL DEFAULT 1 COMMENT '1 ÂêØÁî® / 0 ÂÅúÁî®',
  `is_deleted` int(11) NOT NULL DEFAULT 0,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_post_code` (`post_code`),
  UNIQUE KEY `uk_sys_post_code` (`post_code`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Â≤ó‰Ωç‰∏ªÊï∞ÊçÆ';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_post`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_post` WRITE;
/*!40000 ALTER TABLE `sys_post` DISABLE KEYS */;
INSERT INTO `sys_post` VALUES
(1,'GM','ÊÄªÁªèÁêÜ','ÂÖ¨Âè∏ÊÄªÁªèÁêÜÂ≤ó‰Ωç',1,1,0,NULL,'2026-10-09 00:05:46.246000',NULL,'2026-10-09 00:05:46.246000'),
(2,'HR_MGR','‰∫∫‰∫ãÁªèÁêÜ','‰∫∫‰∫ãÈÉ®ÁªèÁêÜÂ≤ó‰Ωç',2,1,0,NULL,'2026-10-09 00:05:46.248000',NULL,'2026-10-09 00:05:46.248000');
/*!40000 ALTER TABLE `sys_post` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_role`
--

DROP TABLE IF EXISTS `sys_role`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_role` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `is_deleted` int(11) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `role_code` varchar(50) NOT NULL,
  `role_name` varchar(100) NOT NULL,
  `status` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKjqdita2l45v2gglry7bp8kl1f` (`role_code`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_role`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_role` WRITE;
/*!40000 ALTER TABLE `sys_role` DISABLE KEYS */;
INSERT INTO `sys_role` VALUES
(1,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,'Á≥ªÁªüË∂ÖÁ∫ßÁÆ°ÁêÜÂëò','ROLE_ADMIN','Ë∂ÖÁ∫ßÁÆ°ÁêÜÂëò',1),
(2,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,'Á≥ªÁªüÊôÆÈÄöÁî®Êà∑','ROLE_USER','ÊôÆÈÄöÁî®Êà∑',1),
(3,'2026-10-21 03:07:19.148000',NULL,0,'2026-10-21 03:07:19.148000',NULL,'Â∞èÁ®ãÂ∫èÂÆ¢Êà∑Á´ØÁî®Êà∑ÔºõÊï∞ÊçÆÂèØËßÅËåÉÂõ¥Áî®Êï∞ÊçÆËåÉÂõ¥ÊåâÊàêÂëòÁªÑ/Êú¨‰∫∫Êî∂Á¥ß','ROLE_CUSTOMER','ÂÆ¢Êà∑',1);
/*!40000 ALTER TABLE `sys_role` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_role_menu`
--

DROP TABLE IF EXISTS `sys_role_menu`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_role_menu` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `menu_id` bigint(20) NOT NULL,
  `role_id` bigint(20) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9118 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_role_menu`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_role_menu` WRITE;
/*!40000 ALTER TABLE `sys_role_menu` DISABLE KEYS */;
INSERT INTO `sys_role_menu` VALUES
(1,1,1),
(2,2,1),
(3,3,1),
(4,4,1),
(5,5,1),
(6,6,1),
(7,7,1),
(8,8,1),
(9,9,1),
(10,10,1),
(11,11,1),
(12,12,1),
(13,13,1),
(14,14,1),
(15,15,1),
(16,16,1),
(17,17,1),
(18,18,1),
(19,19,1),
(20,20,1),
(21,21,1),
(22,22,1),
(23,23,1),
(24,24,1),
(25,25,1),
(26,26,1),
(27,27,1),
(32,100,1),
(33,101,1),
(34,102,1),
(35,103,1),
(36,110,1),
(37,111,1),
(38,112,1),
(39,120,1),
(40,121,1),
(41,130,1),
(42,131,1),
(43,132,1),
(44,133,1),
(46,113,1),
(47,114,1),
(48,115,1),
(49,140,1),
(50,141,1),
(51,142,1),
(52,150,1),
(53,151,1),
(54,152,1),
(55,153,1),
(56,154,1),
(65,250,1),
(66,251,1),
(67,252,1),
(68,253,1),
(69,254,1),
(70,255,1),
(71,256,1),
(72,257,1),
(73,258,1),
(74,259,1),
(80,260,1),
(81,261,1),
(82,262,1),
(83,263,1),
(87,304,1),
(89,300,1),
(90,305,1),
(91,312,1),
(92,313,1),
(93,314,1),
(94,315,1),
(95,316,1),
(99,171,1),
(100,306,1),
(101,104,1),
(102,301,1),
(103,302,1),
(104,303,1),
(9110,9319,1),
(9111,320,1),
(9112,172,1),
(9113,321,1),
(9114,180,1),
(9115,190,1),
(9117,322,1);
/*!40000 ALTER TABLE `sys_role_menu` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_user`
--

DROP TABLE IF EXISTS `sys_user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_user` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `is_deleted` int(11) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `avatar` varchar(255) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `nickname` varchar(50) DEFAULT NULL,
  `org_id` bigint(20) DEFAULT NULL,
  `password` varchar(255) NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `status` int(11) NOT NULL,
  `username` varchar(50) NOT NULL,
  `post_id` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK51bvuyvihefoh4kp5syh2jpi4` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_user`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_user` WRITE;
/*!40000 ALTER TABLE `sys_user` DISABLE KEYS */;
INSERT INTO `sys_user` VALUES
(1,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,'admin@workflow.com','ÁÆ°ÁêÜÂëò',NULL,'$2a$10$7JB720yubVSZvUI0rEqK/.VqGOZTH.ulu33dHOiBE8ByOhJIrdAu2',NULL,1,'admin',NULL),
(2,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,'test@workflow.com','ÊµãËØïÁî®Êà∑',NULL,'$2a$10$7JB720yubVSZvUI0rEqK/.VqGOZTH.ulu33dHOiBE8ByOhJIrdAu2',NULL,1,'test',NULL);
/*!40000 ALTER TABLE `sys_user` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_user_openid`
--

DROP TABLE IF EXISTS `sys_user_openid`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_user_openid` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `is_deleted` int(11) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `app_id` varchar(64) NOT NULL,
  `openid` varchar(64) NOT NULL,
  `unionid` varchar(64) DEFAULT NULL,
  `user_id` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_openid_app_openid` (`app_id`,`openid`),
  UNIQUE KEY `uk_user_openid_app_user` (`app_id`,`user_id`),
  KEY `idx_user_openid_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_user_openid`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_user_openid` WRITE;
/*!40000 ALTER TABLE `sys_user_openid` DISABLE KEYS */;
/*!40000 ALTER TABLE `sys_user_openid` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_user_role`
--

DROP TABLE IF EXISTS `sys_user_role`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_user_role` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `role_id` bigint(20) NOT NULL,
  `user_id` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FKhh52n8vd4ny9ff4x9fb8v65qx` (`role_id`),
  KEY `FKb40xxfch70f5qnyfw8yme1n1s` (`user_id`),
  CONSTRAINT `FKb40xxfch70f5qnyfw8yme1n1s` FOREIGN KEY (`user_id`) REFERENCES `sys_user` (`id`),
  CONSTRAINT `FKhh52n8vd4ny9ff4x9fb8v65qx` FOREIGN KEY (`role_id`) REFERENCES `sys_role` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_user_role`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_user_role` WRITE;
/*!40000 ALTER TABLE `sys_user_role` DISABLE KEYS */;
INSERT INTO `sys_user_role` VALUES
(1,1,1),
(2,2,2);
/*!40000 ALTER TABLE `sys_user_role` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_biz_ai_muf4tjek39`
--

DROP TABLE IF EXISTS `wf_biz_ai_muf4tjek39`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_biz_ai_muf4tjek39` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `department` varchar(255) DEFAULT NULL,
  `leave_type` varchar(255) DEFAULT NULL,
  `start_date` datetime DEFAULT NULL,
  `end_date` datetime DEFAULT NULL,
  `reason` text DEFAULT NULL,
  `version` int(11) NOT NULL DEFAULT 1,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_biz_ai_muf4tjek39`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_biz_ai_muf4tjek39` WRITE;
/*!40000 ALTER TABLE `wf_biz_ai_muf4tjek39` DISABLE KEYS */;
/*!40000 ALTER TABLE `wf_biz_ai_muf4tjek39` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_biz_ai_muf52ksu88`
--

DROP TABLE IF EXISTS `wf_biz_ai_muf52ksu88`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_biz_ai_muf52ksu88` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `item_name` varchar(255) NOT NULL,
  `quantity` int(11) NOT NULL,
  `unit_price` int(11) NOT NULL,
  `registration_date` date NOT NULL,
  `remarks` text DEFAULT NULL,
  `version` int(11) NOT NULL DEFAULT 1,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_biz_ai_muf52ksu88`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_biz_ai_muf52ksu88` WRITE;
/*!40000 ALTER TABLE `wf_biz_ai_muf52ksu88` DISABLE KEYS */;
/*!40000 ALTER TABLE `wf_biz_ai_muf52ksu88` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_biz_ai_muf58a5n38`
--

DROP TABLE IF EXISTS `wf_biz_ai_muf58a5n38`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_biz_ai_muf58a5n38` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `applicant_name` varchar(255) NOT NULL,
  `department` varchar(255) NOT NULL,
  `reimbursement_type` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`reimbursement_type`)),
  `details` text DEFAULT NULL,
  `amount` int(11) NOT NULL,
  `attachment` varchar(255) DEFAULT NULL,
  `version` int(11) NOT NULL DEFAULT 1,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `reimbursement_type_text` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_biz_ai_muf58a5n38`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_biz_ai_muf58a5n38` WRITE;
/*!40000 ALTER TABLE `wf_biz_ai_muf58a5n38` DISABLE KEYS */;
/*!40000 ALTER TABLE `wf_biz_ai_muf58a5n38` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_biz_bill_test`
--

DROP TABLE IF EXISTS `wf_biz_bill_test`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_biz_bill_test` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `person_id` varchar(255) DEFAULT NULL,
  `person_name` varchar(255) DEFAULT NULL,
  `department` varchar(255) NOT NULL,
  `position` varchar(255) NOT NULL,
  `leave_start_date` date NOT NULL,
  `leave_end_date` date NOT NULL,
  `leave_type` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`leave_type`)),
  `leave_type_text` varchar(255) DEFAULT NULL,
  `leave_days` int(11) NOT NULL,
  `leave_reason` text NOT NULL,
  `contact_phone` varchar(255) NOT NULL,
  `is_approved` varchar(255) NOT NULL,
  `version` int(11) NOT NULL DEFAULT 1,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_biz_bill_test`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_biz_bill_test` WRITE;
/*!40000 ALTER TABLE `wf_biz_bill_test` DISABLE KEYS */;
INSERT INTO `wf_biz_bill_test` VALUES
('78459b7180f6a44e562616c0f741a907','default','1','admin','1','1','2026-09-25','2026-09-25','\"personal\"','‰∫ãÂÅá',1,'1','1','yes',1,NULL,NULL,NULL);
/*!40000 ALTER TABLE `wf_biz_bill_test` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_biz_cust_rel_demo`
--

DROP TABLE IF EXISTS `wf_biz_cust_rel_demo`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_biz_cust_rel_demo` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `Fyczmv3ks22dabc` varchar(255) DEFAULT NULL,
  `Ffxemv3ksch9aec` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`Ffxemv3ksch9aec`)),
  `Ffxemv3ksch9aec_text` varchar(255) DEFAULT NULL,
  `Fzgimv3kskiaahc` varchar(255) DEFAULT NULL,
  `Fqgomv3ksnqrakc` varchar(255) DEFAULT NULL,
  `version` int(11) NOT NULL DEFAULT 1,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_biz_cust_rel_demo`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_biz_cust_rel_demo` WRITE;
/*!40000 ALTER TABLE `wf_biz_cust_rel_demo` DISABLE KEYS */;
INSERT INTO `wf_biz_cust_rel_demo` VALUES
('4813d6c853cb4e1ba392841dde2853e3','default','Âçé‰∏úÁü≥Âåñ','\"Â∑≤ÂÅúÁî®\"','Â∑≤ÂÅúÁî®','Âº†‰ºü','0512-66881234',3,NULL,NULL,'2026-10-11 08:59:33'),
('c720b7cad0684725b5a6aeb445b66931','default','ÈïøÂÆâÁâ©ÊµÅ','\"Â∑≤ÂÅúÁî®\"','Â∑≤ÂÅúÁî®','ÊùéÂ®ú','029-87654321',1,NULL,NULL,NULL),
('d482f21fe9944974ab64ef7391dd29e5','default','ÈÑÇÂ∞îÂ§öÊñØÁüø‰∏ö','\"Á≠πÂª∫‰∏≠\"','Á≠πÂª∫‰∏≠','ÁéãÂº∫','0477-1234567',1,NULL,NULL,NULL);
/*!40000 ALTER TABLE `wf_biz_cust_rel_demo` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_biz_leave_apply_biz`
--

DROP TABLE IF EXISTS `wf_biz_leave_apply_biz`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_biz_leave_apply_biz` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `leave_type` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`leave_type`)),
  `leave_type_text` varchar(255) DEFAULT NULL,
  `reason` varchar(255) DEFAULT NULL,
  `user_id` varchar(255) DEFAULT NULL,
  `name` varchar(255) DEFAULT NULL,
  `version` int(11) NOT NULL DEFAULT 1,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_biz_leave_apply_biz`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_biz_leave_apply_biz` WRITE;
/*!40000 ALTER TABLE `wf_biz_leave_apply_biz` DISABLE KEYS */;
INSERT INTO `wf_biz_leave_apply_biz` VALUES
('988c251ce5874da3b851b6a247bfbb7b','default','1','ÈÄâÈ°π01','ËØ∑ÂÅáÂéüÂõ†','7567d2a6c0f843b990c0d59b609453f2','Âº†‰∏â',5,NULL,NULL,'2026-09-11 19:46:54');
/*!40000 ALTER TABLE `wf_biz_leave_apply_biz` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_biz_leave_ledger_demo`
--

DROP TABLE IF EXISTS `wf_biz_leave_ledger_demo`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_biz_leave_ledger_demo` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `employeeName` varchar(64) DEFAULT NULL,
  `department` varchar(255) DEFAULT NULL,
  `annualDays` int(11) DEFAULT NULL,
  `usedDays` int(11) DEFAULT NULL,
  `version` int(11) NOT NULL DEFAULT 1,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_leave_ledger_demo_employeeName` (`tenant_id`,`employeeName`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_biz_leave_ledger_demo`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_biz_leave_ledger_demo` WRITE;
/*!40000 ALTER TABLE `wf_biz_leave_ledger_demo` DISABLE KEYS */;
INSERT INTO `wf_biz_leave_ledger_demo` VALUES
('06cb8f1deb4e4bf6a04f17aa2507724a','default','Áéã‰∫î','Á†îÂèëÈÉ®',10,6,1,NULL,NULL,NULL),
('1606e9f9a0264cdfa86e14216819d3e6','default','ÊùéÂõõ','Â∏ÇÂú∫ÈÉ®',10,3,1,NULL,NULL,NULL),
('87d5373bceb34cac8f736b364bc55cca','default','Âº†‰∏â','ÊµãËØïÈÉ®',10,1,1,NULL,NULL,NULL);
/*!40000 ALTER TABLE `wf_biz_leave_ledger_demo` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_biz_material_pickup_demo`
--

DROP TABLE IF EXISTS `wf_biz_material_pickup_demo`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_biz_material_pickup_demo` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `productCode` varchar(64) DEFAULT NULL,
  `productName` varchar(255) DEFAULT NULL,
  `qty` int(11) DEFAULT NULL,
  `pickupBy` varchar(64) DEFAULT NULL,
  `remark` varchar(255) DEFAULT NULL,
  `version` int(11) NOT NULL DEFAULT 1,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_biz_material_pickup_demo`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_biz_material_pickup_demo` WRITE;
/*!40000 ALTER TABLE `wf_biz_material_pickup_demo` DISABLE KEYS */;
INSERT INTO `wf_biz_material_pickup_demo` VALUES
('a714dfd5dd1c43a6912bf787164617e0','default','P001','Ê∑±Ê≤üÁêÉËΩ¥Êâø 6204',5,'ÊùéÂõõ','Ë£ÖÈÖçÁ∫øË°•Êñô-ÊµèËßàÂô®ÊºîÁ§∫ÔºàÂú∫ÊôØ2Ôºâ',1,NULL,NULL,NULL),
('ce941a897dd8413e8eb1a686eb4f2c9e','default','P001','Ê∑±Ê≤üÁêÉËΩ¥Êâø 6204',10,'Âº†‰∏â',NULL,1,NULL,NULL,NULL);
/*!40000 ALTER TABLE `wf_biz_material_pickup_demo` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_biz_material_stock_demo`
--

DROP TABLE IF EXISTS `wf_biz_material_stock_demo`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_biz_material_stock_demo` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `productCode` varchar(64) DEFAULT NULL,
  `productName` varchar(255) DEFAULT NULL,
  `stockQty` int(11) DEFAULT NULL,
  `version` int(11) NOT NULL DEFAULT 1,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_material_stock_demo_productCode` (`tenant_id`,`productCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_biz_material_stock_demo`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_biz_material_stock_demo` WRITE;
/*!40000 ALTER TABLE `wf_biz_material_stock_demo` DISABLE KEYS */;
INSERT INTO `wf_biz_material_stock_demo` VALUES
('22eb5c24ff164b5fb70995632ac218d2','default','P003','Ê∏©Â∫¶‰º†ÊÑüÂô® DS18B20',80,2,NULL,NULL,'2026-10-12 03:35:51'),
('b144f3ddd89d41d2948267a3e97b704a','default','P002','Áõ¥ÊµÅÂáèÈÄüÁîµÊú∫ 24V',50,1,NULL,NULL,NULL),
('dfcb4ecfb51d45a584632288f4f614cf','default','P001','Ê∑±Ê≤üÁêÉËΩ¥Êâø 6204',185,11,NULL,NULL,'2026-10-11 16:21:56');
/*!40000 ALTER TABLE `wf_biz_material_stock_demo` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_biz_member_group`
--

DROP TABLE IF EXISTS `wf_biz_member_group`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_biz_member_group` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `group_name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `members` text DEFAULT NULL,
  `members_text` text DEFAULT NULL,
  `post_rules` text DEFAULT NULL,
  `post_rules_text` text DEFAULT NULL,
  `org_rules` text DEFAULT NULL,
  `org_rules_text` text DEFAULT NULL,
  `version` int(11) NOT NULL DEFAULT 1,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci COMMENT='ÊàêÂëòÁªÑÔºà‰∏öÂä°Ë°®Âçï member_group Êï∞ÊçÆÔºâ';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_biz_member_group`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_biz_member_group` WRITE;
/*!40000 ALTER TABLE `wf_biz_member_group` DISABLE KEYS */;
/*!40000 ALTER TABLE `wf_biz_member_group` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_biz_onsite_service_demo`
--

DROP TABLE IF EXISTS `wf_biz_onsite_service_demo`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_biz_onsite_service_demo` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `orderNo` varchar(64) DEFAULT NULL,
  `topic` varchar(255) DEFAULT NULL,
  `serviceType` varchar(255) DEFAULT NULL,
  `serviceArea` varchar(255) DEFAULT NULL,
  `siteLocation` varchar(255) DEFAULT NULL,
  `siteNote` varchar(255) DEFAULT NULL,
  `customerId` text DEFAULT NULL,
  `customerId_text` text DEFAULT NULL,
  `internalNote` varchar(255) DEFAULT NULL,
  `revisit` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`revisit`)),
  `revisit_text` varchar(255) DEFAULT NULL,
  `version` int(11) NOT NULL DEFAULT 1,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_biz_onsite_service_demo`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_biz_onsite_service_demo` WRITE;
/*!40000 ALTER TABLE `wf_biz_onsite_service_demo` DISABLE KEYS */;
INSERT INTO `wf_biz_onsite_service_demo` VALUES
('317b9f6748734aad89650515dfa70f66','default','SVD202610110002',NULL,'repair','ÊµôÊ±üÁúÅ/Êù≠Â∑ûÂ∏Ç/Ë•øÊπñÂå∫','{\"name\":\"ÂÆ¢Êà∑ÂéÇÂå∫Â§ßÈó®\",\"lat\":34.853256,\"lng\":101.601563}',NULL,'[\"4813d6c853cb4e1ba392841dde2853e3\"]','[\"Âçé‰∏úÁü≥Âåñ\"]','ÂÆ¢Êà∑ËÆæÂ§áÊ∏ÖÂçïÈúÄÂú®Á≠æÁ∫¶Âêé 3 ‰∏™Â∑•‰ΩúÊó•ÂÜÖÊèê‰æõ','[\"confirmed\"]','Â∑≤Á°ÆËÆ§ÂõûËÆøËÆ°Âàí',2,NULL,NULL,'2026-10-11 14:45:03'),
('60709ea83bfe4afb94827800062222a9','default','SVD202610110001','‰∫ßÁ∫ø‰º†ÊÑüÂô®ÂÆâË£ÖË∞ÉËØï','install','Ê±üËãèÁúÅ/ËãèÂ∑ûÂ∏Ç/ÂßëËãèÂå∫',NULL,NULL,NULL,'',NULL,NULL,NULL,1,NULL,NULL,NULL),
('d26e9e53d7bb45f181b5e768f4a718b3','default','SVD202610110003','‰∫ßÁ∫ø‰º†ÊÑüÂô®ÂÆâË£ÖË∞ÉËØï','install','Ê±üËãèÁúÅ/ËãèÂ∑ûÂ∏Ç/ÂßëËãèÂå∫','{\"name\":\"ÂÆ¢Êà∑ÂéÇÂå∫Â§ßÈó®\",\"lat\":34.853256,\"lng\":101.601563}','Áé∞Âú∫ÂãòÊü•ÂÆåÊàêÔºå‰º†ÊÑüÂô®ÁÇπ‰ΩçÂ∑≤Á°ÆËÆ§','[\"4813d6c853cb4e1ba392841dde2853e3\"]','[\"Âçé‰∏úÁü≥Âåñ\"]','ÂÆ¢Êà∑ËÆæÂ§áÊ∏ÖÂçïÈúÄÂú®Á≠æÁ∫¶Âêé 3 ‰∏™Â∑•‰ΩúÊó•ÂÜÖÊèê‰æõ','[\"confirmed\"]','Â∑≤Á°ÆËÆ§ÂõûËÆøËÆ°Âàí',1,NULL,NULL,NULL);
/*!40000 ALTER TABLE `wf_biz_onsite_service_demo` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_biz_person`
--

DROP TABLE IF EXISTS `wf_biz_person`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_biz_person` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `code` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `dept` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`dept`)),
  `dept_text` varchar(255) DEFAULT NULL,
  `version` int(11) NOT NULL DEFAULT 1,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_person_code` (`tenant_id`,`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_biz_person`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_biz_person` WRITE;
/*!40000 ALTER TABLE `wf_biz_person` DISABLE KEYS */;
INSERT INTO `wf_biz_person` VALUES
('7567d2a6c0f843b990c0d59b609453f2','default','001','Âº†‰∏â','[\"2\"]','/ÊÄªÂÖ¨Âè∏/Ê≠¶Ê±âÂàÜÂÖ¨Âè∏',2,NULL,NULL,'2026-09-11 15:20:06');
/*!40000 ALTER TABLE `wf_biz_person` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_biz_pickup_log_demo`
--

DROP TABLE IF EXISTS `wf_biz_pickup_log_demo`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_biz_pickup_log_demo` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `productCode` varchar(64) DEFAULT NULL,
  `productName` varchar(255) DEFAULT NULL,
  `qty` int(11) DEFAULT NULL,
  `pickupBy` varchar(64) DEFAULT NULL,
  `sourceNote` varchar(255) DEFAULT NULL,
  `version` int(11) NOT NULL DEFAULT 1,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_biz_pickup_log_demo`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_biz_pickup_log_demo` WRITE;
/*!40000 ALTER TABLE `wf_biz_pickup_log_demo` DISABLE KEYS */;
INSERT INTO `wf_biz_pickup_log_demo` VALUES
('404484a8fc7441a6beecaa9e70f425a4','default','P003',NULL,2,NULL,'Êù•Ê∫êÈ¢ÜÁî®Âçï ',1,NULL,NULL,NULL),
('455988fd0e714ab29eda178f3ef834ab','default','P001','Ê∑±Ê≤üÁêÉËΩ¥Êâø 6204',5,'ÊùéÂõõ','Êù•Ê∫êÈ¢ÜÁî®Âçï a714dfd5dd1c43a6912bf787164617e0',1,NULL,NULL,NULL),
('9710184373c148a083f518de244922ac','default','P001','Ê∑±Ê≤üÁêÉËΩ¥Êâø 6204',10,'Âº†‰∏â','Êù•Ê∫êÈ¢ÜÁî®Âçï ce941a897dd8413e8eb1a686eb4f2c9e',1,NULL,NULL,NULL);
/*!40000 ALTER TABLE `wf_biz_pickup_log_demo` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_category`
--

DROP TABLE IF EXISTS `wf_category`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_category` (
  `id` varchar(64) NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `parent_id` varchar(64) DEFAULT NULL,
  `sort_order` int(11) DEFAULT NULL,
  `tenant_id` varchar(64) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tenant` (`tenant_id`),
  KEY `idx_parent` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_category`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_category` WRITE;
/*!40000 ALTER TABLE `wf_category` DISABLE KEYS */;
INSERT INTO `wf_category` VALUES
('0c0d3ea69e8645778e9da2c9d6c1a735','2026-09-11 10:38:22.330141','Êä•ÈîÄÊµÅÁ®ã',NULL,2,'default'),
('64f4802b34e352e3da0d7aeb9fa71de2','2026-09-24 08:44:04.000000','ËØ∑ÂÅáÊµÅÁ®ã',NULL,1,'default'),
('9fc5266c8e07a5ac9adf80494049bbe2','2026-09-24 08:44:17.000000','Êä•ÈîÄÊµÅÁ®ã',NULL,2,'default'),
('abbde8e4a6f74009a8a595bb7c38973c','2026-09-11 10:37:54.924715','ËÄÉÂã§Áõ∏ÂÖ≥',NULL,1,'default'),
('e7f4b9b29f9a47c388875bc6c007dd11','2026-09-11 10:37:39.432598','Â∏∏Áî®ÊµÅÁ®ã',NULL,0,'default');
/*!40000 ALTER TABLE `wf_category` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_data_source`
--

DROP TABLE IF EXISTS `wf_data_source`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_data_source` (
  `id` varchar(64) NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `form_id` varchar(64) DEFAULT NULL,
  `form_key` varchar(255) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `params` longtext DEFAULT NULL,
  `source_key` varchar(255) DEFAULT NULL,
  `status` varchar(32) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `type` varchar(32) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ds_tenant_name` (`tenant_id`,`name`),
  UNIQUE KEY `uk_ds_tenant_source_key` (`tenant_id`,`source_key`),
  KEY `idx_ds_tenant_type` (`tenant_id`,`type`),
  KEY `idx_wf_data_source_form_id` (`form_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_data_source`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_data_source` WRITE;
/*!40000 ALTER TABLE `wf_data_source` DISABLE KEYS */;
INSERT INTO `wf_data_source` VALUES
('089688bb7ce443e1a9ab56b7b62ab27d','2026-09-27 00:48:10.000000','system','299f7fcdfde04c309f8339772f44b604','ai_muimil5t78','Ë¥πÁî®Êä•ÈîÄÂÆ°ÊâπÊµÅÁ®ãË°®Âçï Êï∞ÊçÆÊ∫ê',NULL,'ai_muimil5t78','ENABLED','default','WORKFLOW','2026-09-27 00:48:10.000000'),
('12cc1853648942ea8608dd53b4f43ee2','2026-09-24 13:05:27.000000','system','8a1c28f22312b38ba4414914e6b504cf','ai_xiaozhi_test','AIÂ∞èÊô∫ÊµãËØïË°®Âçï Êï∞ÊçÆÊ∫ê',NULL,'ai_xiaozhi_test','ENABLED','default','WORKFLOW','2026-09-24 13:05:27.000000'),
('1cc15d6e514842869f324fb13da0d9ce','2026-09-24 14:16:31.000000','system','9e24468dbcf5e57cdeeddcc7934e629f','ai_muf52ksu88','ÂäûÂÖ¨Áî®ÂìÅÁôªËÆ∞‰∏öÂä°Ë°®Âçï Êï∞ÊçÆÊ∫ê','{\"list\":{\"action\":\"/api/v1/biz-data/ai_muf52ksu88\",\"method\":\"GET\",\"parse\":\"records\",\"totalParse\":\"total\"},\"create\":{\"action\":\"/api/v1/biz-data/ai_muf52ksu88\",\"method\":\"POST\"},\"get\":{\"action\":\"/api/v1/biz-data/ai_muf52ksu88/{id}\",\"method\":\"GET\"},\"update\":{\"action\":\"/api/v1/biz-data/ai_muf52ksu88/{id}\",\"method\":\"PUT\"},\"delete\":{\"action\":\"/api/v1/biz-data/ai_muf52ksu88/{id}\",\"method\":\"DELETE\"}}','ai_muf52ksu88','ENABLED','default','FORM','2026-09-25 02:05:14.000000'),
('20f476f047ca4386bfd1365ea5516832','2026-09-11 14:51:23.835660','system','2c229e1269c74446950c2e8d5ce0dd0f','person','ËØ∑ÂÅá‰∫∫Âëò Êï∞ÊçÆÊ∫ê',NULL,'person','ENABLED','default','FORM','2026-09-11 14:51:23.835660'),
('3f014ac986314285ae2216bd24dc433e','2026-09-27 00:52:03.000000','system','e13dba23da7ce03c664dc626db550605','ai_muimnle734','ÂäûÂÖ¨Áî®ÂìÅÈ¢ÜÁî®ÊµÅÁ®ãË°®Âçï Êï∞ÊçÆÊ∫ê',NULL,'ai_muimnle734','ENABLED','default','WORKFLOW','2026-09-27 00:52:03.000000'),
('40dae5b2311f4be9a4379a3022e23a52','2026-09-24 14:36:33.000000','system','648b850b40637d18d6dcdd90211a84fb','ai_muf5sckj12','‰ºöËÆÆÂÆ§È¢ÑÁ∫¶‰∏öÂä°Ë°®Âçï Êï∞ÊçÆÊ∫ê',NULL,'ai_muf5sckj12','ENABLED','default','FORM','2026-09-24 15:01:37.000000'),
('50613845c2674d1e9037b6986a6c163c','2026-09-27 00:51:01.000000','system','088678179269fbc56c5c157386ccbbb3','ai_muimm9du49','Âá∫Â∑ÆÁî≥ËØ∑ÂÆ°ÊâπÊµÅÁ®ãË°®Âçï Êï∞ÊçÆÊ∫ê',NULL,'ai_muimm9du49','ENABLED','default','WORKFLOW','2026-09-27 00:51:01.000000'),
('7efcd8f220a84e13a13b444b211782e4','2026-10-11 14:17:41.449344','system','e55a6bd0b9f043e1b79597caf2a4ef55','onsite_service_demo','Áé∞Âú∫ÊúçÂä°Â∑•Âçï-ÁªÑ‰ª∂ÊºîÁ§∫ Êï∞ÊçÆÊ∫ê',NULL,'onsite_service_demo','ENABLED','default','FORM','2026-10-11 14:17:41.449353'),
('869f98e37736434e9e1d551dac877628','2026-09-27 00:43:12.000000','system','73fc3be4d32a2d1b704f022eb61d1f99','ai_muimc7p374','ÂëòÂ∑•ËØ∑ÂÅáÂÆ°ÊâπÊµÅÁ®ãË°®Âçï Êï∞ÊçÆÊ∫ê',NULL,'ai_muimc7p374','ENABLED','default','WORKFLOW','2026-09-27 00:43:12.000000'),
('91ec520d8f484b68b9307398fe2e15c0','2026-09-24 14:20:57.000000','system','579351c3534ce256077a37b017b91430','ai_muf58a5n38','ÂëòÂ∑•Êä•ÈîÄÁî≥ËØ∑ Êï∞ÊçÆÊ∫ê',NULL,'ai_muf58a5n38','ENABLED','default','FORM','2026-09-24 15:00:55.000000'),
('a4187314fe3342c1ac5d6d52cc099a18','2026-10-11 08:43:50.053320','system','fe5b9d00f241420884f468d61e0c31fe','cust_rel_demo','ÂÆ¢Êà∑Ê°£Ê°à-ÂÖ≥ËÅîÊºîÁ§∫ Êï∞ÊçÆÊ∫ê',NULL,'cust_rel_demo','ENABLED','default','FORM','2026-10-11 08:43:50.053332'),
('a56b4b818d064127bd431c24ef90b03a','2026-09-11 10:49:28.260468','system','3761079572ed48158ccd31159a3ac7ae','leave_apply_biz','ËØ∑ÂÅáÂçï-‰∏öÂä°Ë°®Âçï Êï∞ÊçÆÊ∫ê','{\"queryMode\":\"config\",\"joins\":[{\"alias\":\"j1\",\"targetFormKey\":\"person\",\"localField\":\"user_id\",\"foreignField\":\"id\",\"joinField\":\"name\",\"virtualKey\":\"leave_name\",\"label\":\"ÂßìÂêç-ËØ∑ÂÅá‰∫∫\",\"sortable\":true,\"filterable\":true},{\"targetFormKey\":\"person\",\"localField\":\"user_id\",\"foreignField\":\"id\",\"joinField\":\"dept\",\"virtualKey\":\"leave_dept\",\"label\":\"ÈÉ®Èó®-ËØ∑ÂÅá‰∫∫\",\"sortable\":true,\"filterable\":true}]}','leave_apply_biz','ENABLED','default','FORM','2026-09-11 19:23:44.936285'),
('a9d5b0d6f0274d19b6f39937175620c3','2026-09-15 19:02:45.648946','system','dadf29ae8b54497eaa0d64447e87bbf6','baoxiaodan','Êä•ÈîÄÂçï Êï∞ÊçÆÊ∫ê',NULL,'baoxiaodan','ENABLED','default','WORKFLOW','2026-09-15 19:02:45.648946'),
('cc78ce9ddc784f04ba4b8871285e5779','2026-09-24 15:33:58.000000','system','e6d2ffd44a6baf0d26f10a99d656c705','ai_muf7u70h84','‰ºöËÆÆÂÆ§È¢ÑÁ∫¶Ë°®Âçï Êï∞ÊçÆÊ∫ê',NULL,'ai_muf7u70h84','ENABLED','default','FORM','2026-09-24 15:33:58.000000'),
('dda21b336e3d444d9370aa881316106b','2026-09-24 14:09:29.000000','system','e6ab86607aca0f4dce285f108687f67a','ai_muf4tjek39','ÂëòÂ∑•ËØ∑ÂÅá‰∏öÂä°Ë°®Âçï Êï∞ÊçÆÊ∫ê',NULL,'ai_muf4tjek39','ENABLED','default','FORM','2026-09-24 15:26:21.000000'),
('ds-builtin-dept-tree','2026-10-09 00:05:46.000000','system',NULL,NULL,'ÁªÑÁªáÊú∫ÊûÑ','{\"list\":{\"action\":\"/api/v1/internal/system/dept-tree\",\"method\":\"GET\"}}','dept-tree','ENABLED','system','SYSTEM','2026-10-09 00:05:46.000000'),
('ds-builtin-process-definitions','2026-10-09 00:05:46.000000','system',NULL,NULL,'ÊµÅÁ®ãÂÆö‰πâ','{\"list\":{\"action\":\"/api/v1/internal/system/process/definitions\",\"method\":\"GET\"}}','process-definitions','ENABLED','system','SYSTEM','2026-10-09 00:05:46.000000'),
('ds-builtin-process-instances','2026-10-09 00:05:46.000000','system',NULL,NULL,'ÊµÅÁ®ãÂÆû‰æã','{\"list\":{\"action\":\"/api/v1/internal/system/process/instances\",\"method\":\"GET\"}}','process-instances','ENABLED','system','SYSTEM','2026-10-09 00:05:46.000000'),
('ds-builtin-sys-dicts','2026-10-09 00:05:46.000000','system',NULL,NULL,'Á≥ªÁªüÂ≠óÂÖ∏','{\"list\":{\"action\":\"/api/v1/internal/system/dicts\",\"method\":\"GET\"}}','sys-dicts','ENABLED','system','SYSTEM','2026-10-09 00:05:46.000000'),
('ds-builtin-sys-menus','2026-10-09 00:05:46.000000','system',NULL,NULL,'Á≥ªÁªüËèúÂçï','{\"list\":{\"action\":\"/api/v1/internal/system/menus\",\"method\":\"GET\"}}','sys-menus','ENABLED','system','SYSTEM','2026-10-09 00:05:46.000000'),
('ds-builtin-sys-posts','2026-10-09 00:05:46.000000','system',NULL,NULL,'Á≥ªÁªüÂ≤ó‰Ωç','{\"list\":{\"action\":\"/api/v1/internal/system/posts\",\"method\":\"GET\"}}','sys-posts','ENABLED','system','SYSTEM','2026-10-09 00:05:46.000000'),
('ds-builtin-sys-roles','2026-10-09 00:05:46.000000','system',NULL,NULL,'Á≥ªÁªüËßíËâ≤','{\"list\":{\"action\":\"/api/v1/internal/system/roles\",\"method\":\"GET\"}}','sys-roles','ENABLED','system','SYSTEM','2026-10-09 00:05:46.000000'),
('ds-builtin-todo-tasks','2026-10-09 00:05:46.000000','system',NULL,NULL,'ÂæÖÂäû‰ªªÂä°','{\"list\":{\"action\":\"/api/v1/internal/system/process/todo-tasks\",\"method\":\"GET\"}}','todo-tasks','ENABLED','system','SYSTEM','2026-10-09 00:05:46.000000'),
('ds-builtin-user-tree','2026-10-09 00:05:46.000000','system',NULL,NULL,'Á≥ªÁªüÁî®Êà∑','{\"list\":{\"action\":\"/api/v1/internal/system/users\",\"method\":\"GET\"}}','user-tree','ENABLED','system','SYSTEM','2026-10-09 00:05:46.000000'),
('e6741228ebda42fb8fa0c5717800d27a','2026-09-24 00:23:43.000000','system','9dc27e83b084a95bb4230f60fd92bc34','bill_test','ÊµãËØïË°®Âçï Êï∞ÊçÆÊ∫ê','{\"list\":{\"action\":\"/api/v1/biz-data/bill_test\",\"method\":\"GET\",\"parse\":\"records\",\"totalParse\":\"total\"},\"create\":{\"action\":\"/api/v1/biz-data/bill_test\",\"method\":\"POST\"},\"get\":{\"action\":\"/api/v1/biz-data/bill_test/{id}\",\"method\":\"GET\"},\"update\":{\"action\":\"/api/v1/biz-data/bill_test/{id}\",\"method\":\"PUT\"},\"delete\":{\"action\":\"/api/v1/biz-data/bill_test/{id}\",\"method\":\"DELETE\"},\"queryMode\":\"config\",\"joins\":[{\"targetFormKey\":\"user-tree\",\"localField\":\"person_id\",\"foreignField\":\"id\",\"joinField\":\"username\",\"virtualKey\":\"apply_name\",\"label\":\"Áî≥ËØ∑‰∫∫ÂßìÂêç\",\"sortable\":true,\"filterable\":true}]}','bill_test','ENABLED','default','FORM','2026-09-25 08:19:04.000000');
/*!40000 ALTER TABLE `wf_data_source` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_engine_notify`
--

DROP TABLE IF EXISTS `wf_engine_notify`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_engine_notify` (
  `id` varchar(64) NOT NULL COMMENT 'UUID',
  `tenant_id` varchar(64) NOT NULL DEFAULT 'default' COMMENT 'ÁßüÊà∑ ID',
  `instance_id` varchar(64) NOT NULL COMMENT 'ÊµÅÁ®ãÂÆû‰æã ID',
  `task_id` varchar(64) DEFAULT NULL COMMENT 'ÂÖ≥ËÅî‰ªªÂä° IDÔºàÂÆû‰æãÁ∫ßÈÄöÁü•‰∏∫ NULLÔºâ',
  `notify_type` varchar(32) NOT NULL COMMENT 'ÈÄöÁü•Á±ªÂûãÔºöSMS_NODE/SMS_END/TIMEOUT_REMIND',
  `target_user` varchar(64) NOT NULL COMMENT 'ÁõÆÊ†áÁî®Êà∑ ID',
  `content` varchar(500) NOT NULL COMMENT 'ÈÄöÁü•ÂÜÖÂÆπ',
  `status` varchar(16) NOT NULL DEFAULT 'PENDING' COMMENT 'ÂèëÈÄÅÁä∂ÊÄÅÔºöPENDING/SENT/FAILED',
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3) COMMENT 'ÂàõÂª∫Êó∂Èó¥',
  PRIMARY KEY (`id`),
  KEY `idx_engine_notify_instance` (`instance_id`),
  KEY `idx_engine_notify_target` (`target_user`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ÂºïÊìéÂ§ñÂèëÈÄöÁü•ËÆ∞ÂΩï';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_engine_notify`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_engine_notify` WRITE;
/*!40000 ALTER TABLE `wf_engine_notify` DISABLE KEYS */;
/*!40000 ALTER TABLE `wf_engine_notify` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_form_data`
--

DROP TABLE IF EXISTS `wf_form_data`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_form_data` (
  `id` varchar(64) NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `data_json` longtext DEFAULT NULL,
  `form_def_id` varchar(64) NOT NULL,
  `form_version` int(11) NOT NULL,
  `is_snapshot` bit(1) NOT NULL,
  `process_instance_id` varchar(64) DEFAULT NULL,
  `task_id` varchar(64) DEFAULT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_form_data_def_proc` (`form_def_id`,`process_instance_id`),
  KEY `idx_form_data_tenant_proc` (`tenant_id`,`process_instance_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_form_data`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_form_data` WRITE;
/*!40000 ALTER TABLE `wf_form_data` DISABLE KEYS */;
/*!40000 ALTER TABLE `wf_form_data` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_form_def`
--

DROP TABLE IF EXISTS `wf_form_def`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_form_def` (
  `id` varchar(64) NOT NULL,
  `column_config` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`column_config`)),
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `key` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `process_key` varchar(64) DEFAULT NULL,
  `published_version` int(11) DEFAULT NULL,
  `schema` longtext DEFAULT NULL,
  `status` varchar(32) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `type` varchar(20) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `version` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_form_def_tenant_key_version` (`tenant_id`,`key`,`version`),
  KEY `idx_form_def_tenant_status` (`tenant_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_form_def`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_form_def` WRITE;
/*!40000 ALTER TABLE `wf_form_def` DISABLE KEYS */;
INSERT INTO `wf_form_def` VALUES
('4b9acbefdce8477e9f2a374ca50ad19d','[{\"key\": \"productCode\", \"label\": \"Áâ©ÊñôÁºñÁ†Å\", \"columnType\": \"VARCHAR\", \"length\": 64, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"componentType\": \"input\"}, {\"key\": \"productName\", \"label\": \"Áâ©ÊñôÂêçÁß∞\", \"columnType\": \"VARCHAR\", \"length\": 255, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"componentType\": \"input\"}, {\"key\": \"qty\", \"label\": \"È¢ÜÁî®Êï∞Èáè\", \"columnType\": \"INT\", \"length\": null, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"componentType\": \"inputNumber\"}, {\"key\": \"pickupBy\", \"label\": \"È¢ÜÁî®‰∫∫\", \"columnType\": \"VARCHAR\", \"length\": 64, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"componentType\": \"input\"}, {\"key\": \"remark\", \"label\": \"Áî®ÈÄîËØ¥Êòé\", \"columnType\": \"VARCHAR\", \"length\": 255, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"componentType\": \"input\"}]','2026-10-11 16:06:32.741572',NULL,'material_pickup_demo','Áâ©ÊñôÈ¢ÜÁî®Âçï-ÈÄªËæëÊµÅÊºîÁ§∫',NULL,1,'{\"rule\": [{\"type\": \"input\", \"field\": \"productCode\", \"title\": \"Áâ©ÊñôÁºñÁ†Å\", \"props\": {\"placeholder\": \"Â¶Ç P001\"}, \"info\": \"Êèê‰∫§ÂêéÈÄªËæëÊµÅËá™Âä®Êâ£ÂáèÁâ©ÊñôÂ∫ìÂ≠òÂπ∂ÂÜôÂÖ•È¢ÜÁî®ÊµÅÊ∞¥\"}, {\"type\": \"input\", \"field\": \"productName\", \"title\": \"Áâ©ÊñôÂêçÁß∞\"}, {\"type\": \"inputNumber\", \"field\": \"qty\", \"title\": \"È¢ÜÁî®Êï∞Èáè\", \"props\": {\"min\": 1, \"precision\": 0}}, {\"type\": \"input\", \"field\": \"pickupBy\", \"title\": \"È¢ÜÁî®‰∫∫\"}, {\"type\": \"input\", \"field\": \"remark\", \"title\": \"Áî®ÈÄîËØ¥Êòé\", \"props\": {\"type\": \"textarea\", \"rows\": 2}}], \"option\": {\"form\": {\"labelPosition\": \"right\", \"labelWidth\": \"110px\"}, \"submitBtn\": true, \"resetBtn\": false}}','PUBLISHED','default','BUSINESS','2026-10-11 16:06:32.773567',1),
('5c14d27b0f9c44ec930e9b0a62fb6800','[{\"key\":\"device_name\",\"label\":\"ËÆæÂ§áÂêçÁß∞\",\"columnType\":\"VARCHAR\",\"length\":null,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"hidden\":false,\"pickerConfig\":null,\"storageMode\":\"JSON\",\"componentType\":\"input\",\"sortable\":null,\"filterable\":null,\"matchType\":null,\"subColumns\":null,\"subMode\":null},{\"key\":\"fault_description\",\"label\":\"ÊïÖÈöúÊèèËø∞\",\"columnType\":\"VARCHAR\",\"length\":null,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"hidden\":false,\"pickerConfig\":null,\"storageMode\":\"JSON\",\"componentType\":\"input\",\"sortable\":null,\"filterable\":null,\"matchType\":null,\"subColumns\":null,\"subMode\":null},{\"key\":\"reporter\",\"label\":\"Êä•‰øÆ‰∫∫\",\"columnType\":\"VARCHAR\",\"length\":null,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"hidden\":false,\"pickerConfig\":null,\"storageMode\":\"JSON\",\"componentType\":\"input\",\"sortable\":null,\"filterable\":null,\"matchType\":null,\"subColumns\":null,\"subMode\":null},{\"key\":\"urgency_level\",\"label\":\"Á¥ßÊÄ•Á®ãÂ∫¶\",\"columnType\":\"VARCHAR\",\"length\":null,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"hidden\":false,\"pickerConfig\":null,\"storageMode\":\"JSON\",\"componentType\":\"select\",\"sortable\":null,\"filterable\":null,\"matchType\":null,\"subColumns\":null,\"subMode\":null}]','2026-10-11 15:01:50.680924',NULL,'ai_mv3ybmpz77','ËÆæÂ§áÊä•‰øÆÁôªËÆ∞Ë°®Âçï',NULL,NULL,'{\"rule\":[{\"type\":\"input\",\"field\":\"device_name\",\"title\":\"ËÆæÂ§áÂêçÁß∞\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"ËØ∑Â°´ÂÜôËÆæÂ§áÂêçÁß∞\"}]},{\"type\":\"input\",\"field\":\"fault_description\",\"title\":\"ÊïÖÈöúÊèèËø∞\",\"value\":null,\"props\":{\"type\":\"textarea\"},\"validate\":[{\"required\":true,\"message\":\"ËØ∑Â°´ÂÜôÊïÖÈöúÊèèËø∞\"}]},{\"type\":\"input\",\"field\":\"reporter\",\"title\":\"Êä•‰øÆ‰∫∫\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"ËØ∑Â°´ÂÜôÊä•‰øÆ‰∫∫\"}]},{\"type\":\"select\",\"field\":\"urgency_level\",\"title\":\"Á¥ßÊÄ•Á®ãÂ∫¶\",\"value\":null,\"options\":[{\"label\":\"È´ò\",\"value\":\"È´ò\"},{\"label\":\"‰∏≠\",\"value\":\"‰∏≠\"},{\"label\":\"‰Ωé\",\"value\":\"‰Ωé\"}],\"validate\":[{\"required\":true,\"message\":\"ËØ∑ÈÄâÊã©Á¥ßÊÄ•Á®ãÂ∫¶\"}]}]}','DRAFT','default','BUSINESS','2026-10-11 15:01:50.729359',1),
('66bbda9854184d4fbcf0a07823048f89',NULL,'2026-10-12 04:47:00.462216',NULL,'cm6_fx_tmp_test','CM6ÂÖ¨ÂºèÁºñËæëÂô®‰∏¥Êó∂È™åËØÅ',NULL,NULL,'[]','DRAFT','default','WORKFLOW','2026-10-12 04:47:00.462234',1),
('6a872bbcebd6462a83ff4a2722b4df2b','[{\"key\": \"employeeName\", \"label\": \"ÂëòÂ∑•ÂßìÂêç\", \"columnType\": \"VARCHAR\", \"length\": 64, \"scale\": null, \"required\": false, \"unique\": true, \"indexed\": false, \"componentType\": \"input\"}, {\"key\": \"department\", \"label\": \"ÊâÄÂ±ûÈÉ®Èó®\", \"columnType\": \"VARCHAR\", \"length\": 255, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"componentType\": \"input\"}, {\"key\": \"annualDays\", \"label\": \"Âπ¥ÂÅáÊÄªÈ¢ù\", \"columnType\": \"INT\", \"length\": null, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"componentType\": \"inputNumber\"}, {\"key\": \"usedDays\", \"label\": \"Â∑≤Áî®Â§©Êï∞\", \"columnType\": \"INT\", \"length\": null, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"componentType\": \"inputNumber\"}]','2026-10-11 16:06:31.293449',NULL,'leave_ledger_demo','ÂëòÂ∑•Âπ¥ÂÅáÂè∞Ë¥¶-ÈÄªËæëÊµÅÊºîÁ§∫',NULL,1,'{\"rule\": [{\"type\": \"input\", \"field\": \"employeeName\", \"title\": \"ÂëòÂ∑•ÂßìÂêç\", \"props\": {\"placeholder\": \"ËØ∑ËæìÂÖ•ÂëòÂ∑•ÂßìÂêç\"}}, {\"type\": \"input\", \"field\": \"department\", \"title\": \"ÊâÄÂ±ûÈÉ®Èó®\"}, {\"type\": \"inputNumber\", \"field\": \"annualDays\", \"title\": \"Âπ¥ÂÅáÊÄªÈ¢ù(Â§©)\", \"props\": {\"min\": 0, \"precision\": 0}}, {\"type\": \"inputNumber\", \"field\": \"usedDays\", \"title\": \"Â∑≤Áî®Â§©Êï∞\", \"props\": {\"min\": 0, \"precision\": 0}}], \"option\": {\"form\": {\"labelPosition\": \"right\", \"labelWidth\": \"110px\"}, \"submitBtn\": true, \"resetBtn\": false}}','PUBLISHED','default','BUSINESS','2026-10-11 16:06:31.361909',1),
('757332f798b545efa453fa37669a9193',NULL,'2026-10-11 16:06:31.390175',NULL,'leave_apply_demo','ËØ∑ÂÅáÁî≥ËØ∑-ÈÄªËæëÊµÅÊºîÁ§∫',NULL,1,'{\"rule\": [{\"type\": \"input\", \"field\": \"applicant\", \"title\": \"ËØ∑ÂÅá‰∫∫\", \"props\": {\"placeholder\": \"ËØ∑ËæìÂÖ•ËØ∑ÂÅá‰∫∫ÂßìÂêç\"}}, {\"type\": \"input\", \"field\": \"department\", \"title\": \"ÊâÄÂ±ûÈÉ®Èó®\"}, {\"type\": \"inputNumber\", \"field\": \"days\", \"title\": \"ËØ∑ÂÅáÂ§©Êï∞\", \"props\": {\"min\": 1, \"max\": 30, \"precision\": 0}, \"info\": \"ÂÆ°ÊâπÈÄöËøáÂêéÈÄªËæëÊµÅËá™Âä®Á¥ØÂä†Âà∞Âπ¥ÂÅáÂè∞Ë¥¶\"}, {\"type\": \"datePicker\", \"field\": \"startDate\", \"title\": \"ÂºÄÂßãÊó•Êúü\", \"props\": {\"type\": \"date\", \"placeholder\": \"ËØ∑ÈÄâÊã©ÂºÄÂßãÊó•Êúü\"}}, {\"type\": \"input\", \"field\": \"reason\", \"title\": \"ËØ∑ÂÅá‰∫ãÁî±\", \"props\": {\"type\": \"textarea\", \"rows\": 3}}], \"option\": {\"form\": {\"labelPosition\": \"right\", \"labelWidth\": \"110px\"}, \"submitBtn\": true, \"resetBtn\": false}}','PUBLISHED','default','WORKFLOW','2026-10-11 16:06:31.439862',1),
('9e02e7148d184f9f89b4a20f47b84bdc','[{\"key\": \"productCode\", \"label\": \"Áâ©ÊñôÁºñÁ†Å\", \"columnType\": \"VARCHAR\", \"length\": 64, \"scale\": null, \"required\": false, \"unique\": true, \"indexed\": false, \"componentType\": \"input\"}, {\"key\": \"productName\", \"label\": \"Áâ©ÊñôÂêçÁß∞\", \"columnType\": \"VARCHAR\", \"length\": 255, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"componentType\": \"input\"}, {\"key\": \"stockQty\", \"label\": \"Â∫ìÂ≠òÊï∞Èáè\", \"columnType\": \"INT\", \"length\": null, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"componentType\": \"inputNumber\"}]','2026-10-11 16:06:32.573572',NULL,'material_stock_demo','Áâ©ÊñôÂ∫ìÂ≠ò-ÈÄªËæëÊµÅÊºîÁ§∫',NULL,1,'{\"rule\": [{\"type\": \"input\", \"field\": \"productCode\", \"title\": \"Áâ©ÊñôÁºñÁ†Å\", \"props\": {\"placeholder\": \"Â¶Ç P001\"}}, {\"type\": \"input\", \"field\": \"productName\", \"title\": \"Áâ©ÊñôÂêçÁß∞\"}, {\"type\": \"inputNumber\", \"field\": \"stockQty\", \"title\": \"Â∫ìÂ≠òÊï∞Èáè\", \"props\": {\"min\": 0, \"precision\": 0}}], \"option\": {\"form\": {\"labelPosition\": \"right\", \"labelWidth\": \"110px\"}, \"submitBtn\": true, \"resetBtn\": false}}','PUBLISHED','default','BUSINESS','2026-10-11 16:06:32.633591',1),
('d8e89de254ce41c6bc811b68508c77d3','[{\"key\": \"productCode\", \"label\": \"Áâ©ÊñôÁºñÁ†Å\", \"columnType\": \"VARCHAR\", \"length\": 64, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"componentType\": \"input\"}, {\"key\": \"productName\", \"label\": \"Áâ©ÊñôÂêçÁß∞\", \"columnType\": \"VARCHAR\", \"length\": 255, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"componentType\": \"input\"}, {\"key\": \"qty\", \"label\": \"Êï∞Èáè\", \"columnType\": \"INT\", \"length\": null, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"componentType\": \"inputNumber\"}, {\"key\": \"pickupBy\", \"label\": \"È¢ÜÁî®‰∫∫\", \"columnType\": \"VARCHAR\", \"length\": 64, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"componentType\": \"input\"}, {\"key\": \"sourceNote\", \"label\": \"Êù•Ê∫êÂçïÊçÆ\", \"columnType\": \"VARCHAR\", \"length\": 255, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"componentType\": \"input\"}]','2026-10-11 16:06:32.656053',NULL,'pickup_log_demo','È¢ÜÁî®ÊµÅÊ∞¥-ÈÄªËæëÊµÅÊºîÁ§∫',NULL,1,'{\"rule\": [{\"type\": \"input\", \"field\": \"productCode\", \"title\": \"Áâ©ÊñôÁºñÁ†Å\"}, {\"type\": \"input\", \"field\": \"productName\", \"title\": \"Áâ©ÊñôÂêçÁß∞\"}, {\"type\": \"inputNumber\", \"field\": \"qty\", \"title\": \"Êï∞Èáè\", \"props\": {\"min\": 0, \"precision\": 0}}, {\"type\": \"input\", \"field\": \"pickupBy\", \"title\": \"È¢ÜÁî®‰∫∫\"}, {\"type\": \"input\", \"field\": \"sourceNote\", \"title\": \"Êù•Ê∫êÂçïÊçÆ\"}], \"option\": {\"form\": {\"labelPosition\": \"right\", \"labelWidth\": \"110px\"}, \"submitBtn\": false, \"resetBtn\": false}}','PUBLISHED','default','BUSINESS','2026-10-11 16:06:32.721690',1),
('e55a6bd0b9f043e1b79597caf2a4ef55','[{\"key\": \"orderNo\", \"label\": \"Â∑•ÂçïÁºñÂè∑\", \"columnType\": \"VARCHAR\", \"length\": 64, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"componentType\": \"AutoNumber\"}, {\"key\": \"topic\", \"label\": \"ÊúçÂä°‰∏ªÈ¢ò\", \"columnType\": \"VARCHAR\", \"length\": 255, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"componentType\": \"input\"}, {\"key\": \"serviceType\", \"label\": \"ÊúçÂä°Á±ªÂûã\", \"columnType\": \"VARCHAR\", \"length\": 255, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"componentType\": \"dictSelect\"}, {\"key\": \"serviceArea\", \"label\": \"ÊúçÂä°Âú∞ÂùÄ\", \"columnType\": \"VARCHAR\", \"length\": 255, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"componentType\": \"areaPicker\"}, {\"key\": \"siteLocation\", \"label\": \"Áé∞Âú∫ÂÆö‰Ωç\", \"columnType\": \"VARCHAR\", \"length\": 255, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"componentType\": \"LocationPicker\"}, {\"key\": \"siteNote\", \"label\": \"Áé∞Âú∫Á∫™Ë¶Å\", \"columnType\": \"VARCHAR\", \"length\": 255, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"componentType\": \"input\"}, {\"key\": \"customerId\", \"label\": \"ÂÖ≥ËÅîÂÆ¢Êà∑\", \"columnType\": \"TEXT\", \"length\": null, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"componentType\": \"dataPicker\", \"pickerConfig\": \"{\\\"sourceFormKey\\\": \\\"cust_rel_demo\\\", \\\"dataSourceId\\\": null, \\\"displayField\\\": \\\"Fyczmv3ks22dabc\\\", \\\"maxCount\\\": 1, \\\"pickerType\\\": \\\"dataPicker\\\"}\"}, {\"key\": \"customerId_text\", \"label\": \"ÂÖ≥ËÅîÂÆ¢Êà∑ÔºàÊòæÁ§∫Ôºâ\", \"columnType\": \"TEXT\", \"length\": null, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"componentType\": \"dataPickerText\", \"hidden\": true}, {\"key\": \"internalNote\", \"label\": \"ÂÜÖÈÉ®Â§áÊ≥®\", \"columnType\": \"VARCHAR\", \"length\": 255, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"componentType\": \"input\"}, {\"key\": \"revisit\", \"label\": \"ÂõûËÆøËÆ°Âàí\", \"columnType\": \"JSON\", \"length\": null, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"componentType\": \"checkbox\"}, {\"key\": \"revisit_text\", \"label\": \"ÂõûËÆøËÆ°ÂàíÔºàÊòæÁ§∫Ôºâ\", \"columnType\": \"VARCHAR\", \"length\": 255, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"componentType\": \"checkboxText\", \"hidden\": true}]','2026-10-11 14:30:04.552378',NULL,'onsite_service_demo','Áé∞Âú∫ÊúçÂä°Â∑•Âçï-ÁªÑ‰ª∂ÊºîÁ§∫',NULL,1,'{\"rule\": [{\"type\": \"StepsForm\", \"props\": {\"steps\": [{\"title\": \"Âü∫Êú¨‰ø°ÊÅØ\", \"description\": \"Â∑•ÂçïÁºñÂè∑‰∏éÊúçÂä°ÂÜÖÂÆπ\"}, {\"title\": \"Áé∞Âú∫‰ø°ÊÅØ\", \"description\": \"ÂÆö‰Ωç‰∏éÁé∞Âú∫Á∫™Ë¶Å\"}, {\"title\": \"ÂÖ≥ËÅîÂÆ¢Êà∑\", \"description\": \"ÈÄâÊã©ÂÆ¢Êà∑Êü•ÁúãÂÆûÊó∂Ê°£Ê°à\"}], \"active\": 0, \"direction\": \"horizontal\"}, \"style\": {\"width\": \"100%\"}, \"children\": [{\"type\": \"elCard\", \"props\": {\"header\": \"Á¨¨‰∏ÄÊ≠•ÔºöÂü∫Êú¨‰ø°ÊÅØ\"}, \"children\": [{\"type\": \"AutoNumber\", \"field\": \"orderNo\", \"title\": \"Â∑•ÂçïÁºñÂè∑\", \"props\": {\"prefix\": \"SVD\", \"dateFormat\": \"yyyyMMdd\", \"resetPolicy\": \"day\", \"seqDigits\": 4}, \"info\": \"Êèê‰∫§ÂêéÁî±ÂêéÁ´ØËá™Âä®ÁîüÊàê\"}, {\"type\": \"input\", \"field\": \"topic\", \"title\": \"ÊúçÂä°‰∏ªÈ¢ò\", \"props\": {\"placeholder\": \"Â¶ÇÔºö2Âè∑‰∫ßÁ∫ø‰º†ÊÑüÂô®Êõ¥Êç¢\"}}, {\"type\": \"dictSelect\", \"field\": \"serviceType\", \"title\": \"ÊúçÂä°Á±ªÂûã\", \"props\": {\"dictTypeCode\": \"service_type\", \"placeholder\": \"ËØ∑ÈÄâÊã©ÊúçÂä°Á±ªÂûã\", \"clearable\": true}}, {\"type\": \"areaPicker\", \"field\": \"serviceArea\", \"title\": \"ÊúçÂä°Âú∞ÂùÄ\", \"props\": {\"placeholder\": \"ËØ∑ÈÄâÊã©ÁúÅ/Â∏Ç/Âå∫\", \"clearable\": true, \"showAllLevels\": true}}]}, {\"type\": \"elCard\", \"props\": {\"header\": \"Á¨¨‰∫åÊ≠•ÔºöÁé∞Âú∫‰ø°ÊÅØ\"}, \"children\": [{\"type\": \"LocationPicker\", \"field\": \"siteLocation\", \"title\": \"Áé∞Âú∫ÂÆö‰Ωç\", \"props\": {\"placeholder\": \"ÁÇπÂáªÈÄâÊã©‰ΩçÁΩÆ\", \"clearable\": true}}, {\"type\": \"input\", \"field\": \"siteNote\", \"title\": \"Áé∞Âú∫Á∫™Ë¶Å\", \"props\": {\"type\": \"textarea\", \"rows\": 3, \"placeholder\": \"Áé∞Âú∫ÊÉÖÂÜµËÆ∞ÂΩïÔºàÂ§öË°åÔºâ\"}}]}, {\"type\": \"elCard\", \"props\": {\"header\": \"Á¨¨‰∏âÊ≠•ÔºöÂÖ≥ËÅîÂÆ¢Êà∑\"}, \"children\": [{\"type\": \"dataPicker\", \"field\": \"customerId\", \"title\": \"ÂÖ≥ËÅîÂÆ¢Êà∑\", \"props\": {\"sourceFormKey\": \"cust_rel_demo\", \"displayField\": \"Fyczmv3ks22dabc\", \"maxCount\": 1}}, {\"type\": \"RelationCard\", \"field\": \"relCard\", \"title\": \"ÂÆ¢Êà∑ÂÆûÊó∂Ê°£Ê°à\", \"props\": {\"title\": \"ÂÆ¢Êà∑ÂÆûÊó∂Ê°£Ê°à\", \"globalDataSourceId\": \"a4187314fe3342c1ac5d6d52cc099a18\", \"recordIdField\": \"customerId\", \"displayFields\": [\"Fyczmv3ks22dabc\", \"Ffxemv3ksch9aec\", \"Fzgimv3kskiaahc\", \"Fqgomv3ksnqrakc\"], \"clickable\": true, \"description\": \"Êï∞ÊçÆÂÆûÊó∂Êù•Ëá™ÂÆ¢Êà∑Êï∞ÊçÆÊ∫êÔºåÊ∫êÊï∞ÊçÆÂèòÊõ¥ÂêéËá™Âä®Â±ïÁ§∫ÊúÄÊñ∞ÂÄº\"}}]}]}, {\"type\": \"DrawerContainer\", \"props\": {\"buttonText\": \"Êâ©Â±ï‰ø°ÊÅØ\", \"buttonType\": \"primary\", \"plain\": true, \"title\": \"Êâ©Â±ï‰ø°ÊÅØ\", \"size\": \"40%\"}, \"style\": {\"width\": \"100%\"}, \"children\": [{\"type\": \"input\", \"field\": \"internalNote\", \"title\": \"ÂÜÖÈÉ®Â§áÊ≥®\", \"props\": {\"placeholder\": \"‰ªÖÂÜÖÈÉ®ÂèØËßÅÔºàÂ≠ò‰∫éÊäΩÂ±âÂÆπÂô®Ôºâ\"}}, {\"type\": \"checkbox\", \"field\": \"revisit\", \"title\": \"ÂõûËÆøËÆ°Âàí\", \"options\": [{\"label\": \"Â∑≤Á°ÆËÆ§ÂõûËÆøËÆ°Âàí\", \"value\": \"confirmed\"}, {\"label\": \"ÈúÄË¶ÅÊäÄÊúØÊîØÊåÅË∑üËøõ\", \"value\": \"tech\"}]}]}], \"option\": {\"form\": {\"labelPosition\": \"right\", \"labelWidth\": \"110px\"}, \"submitBtn\": true, \"resetBtn\": false}}','PUBLISHED','default','BUSINESS','2026-10-11 14:30:04.656394',1),
('e8012c32c67c460583df0b8f24fd025d','[{\"key\": \"visitNo\", \"label\": \"Â∑•ÂçïÁºñÂè∑\", \"columnType\": \"VARCHAR\", \"length\": 64, \"scale\": null, \"componentType\": \"AutoNumber\"}, {\"key\": \"customerName\", \"label\": \"ÂÆ¢Êà∑ÂêçÁß∞\", \"columnType\": \"VARCHAR\", \"length\": 255, \"scale\": null, \"componentType\": \"input\"}, {\"key\": \"customerLevel\", \"label\": \"ÂÆ¢Êà∑Á≠âÁ∫ß\", \"columnType\": \"VARCHAR\", \"length\": 255, \"scale\": null, \"componentType\": \"dictSelect\"}, {\"key\": \"visitRegion\", \"label\": \"ÊãúËÆøÂå∫Âüü\", \"columnType\": \"VARCHAR\", \"length\": 255, \"scale\": null, \"componentType\": \"areaPicker\"}, {\"key\": \"visitLocation\", \"label\": \"Áé∞Âú∫ÂÆö‰Ωç\", \"columnType\": \"VARCHAR\", \"length\": 255, \"scale\": null, \"componentType\": \"LocationPicker\"}, {\"key\": \"visitSummary\", \"label\": \"ÊãúËÆøÁ∫™Ë¶Å\", \"columnType\": \"TEXT\", \"length\": null, \"scale\": null, \"componentType\": \"input\"}, {\"key\": \"competitor\", \"label\": \"Á´ûÂìÅÊÉÖÂÜµ\", \"columnType\": \"VARCHAR\", \"length\": 255, \"scale\": null, \"componentType\": \"input\"}, {\"key\": \"followPlan\", \"label\": \"ÂêéÁª≠ËÆ°Âàí\", \"columnType\": \"TEXT\", \"length\": null, \"scale\": null, \"componentType\": \"input\"}, {\"key\": \"relCustomer\", \"label\": \"ÂÖ≥ËÅîÂÆ¢Êà∑\", \"columnType\": \"TEXT\", \"length\": null, \"scale\": null, \"componentType\": \"dataPicker\", \"pickerConfig\": \"{\\\"sourceFormKey\\\": \\\"cust_rel_demo\\\", \\\"dataSourceId\\\": null, \\\"displayField\\\": \\\"Fyczmv3ks22dabc\\\", \\\"maxCount\\\": 1, \\\"pickerType\\\": \\\"dataPicker\\\"}\"}, {\"key\": \"relCustomer_text\", \"label\": \"ÂÖ≥ËÅîÂÆ¢Êà∑ÔºàÊòæÁ§∫Ôºâ\", \"columnType\": \"TEXT\", \"length\": null, \"scale\": null, \"hidden\": true, \"componentType\": \"dataPickerText\"}]','2026-10-11 14:09:18.340860',NULL,'visit_demo','ÂÆ¢Êà∑ÊãúËÆøÂ∑•Âçï-ÁªÑ‰ª∂ÊºîÁ§∫',NULL,1,'{\"rule\": [{\"type\": \"StepsForm\", \"props\": {\"steps\": [{\"title\": \"Âü∫Êú¨‰ø°ÊÅØ\", \"description\": \"ÁºñÂè∑ / Á≠âÁ∫ß / Âå∫Âüü\"}, {\"title\": \"Áé∞Âú∫‰ø°ÊÅØ\", \"description\": \"ÂÆö‰Ωç / Á∫™Ë¶Å / ËÆ°Âàí\"}, {\"title\": \"ÂÆ¢Êà∑ÂÖ≥ËÅî\", \"description\": \"ÂÆûÊó∂Ê°£Ê°à\"}], \"active\": 0, \"direction\": \"horizontal\"}, \"style\": {\"width\": \"100%\"}, \"children\": [{\"type\": \"elCard\", \"props\": {\"header\": \"Âü∫Êú¨‰ø°ÊÅØ\", \"shadow\": \"never\"}, \"style\": {\"width\": \"100%\"}, \"children\": [{\"type\": \"AutoNumber\", \"field\": \"visitNo\", \"title\": \"Â∑•ÂçïÁºñÂè∑\", \"props\": {\"prefix\": \"BF\", \"dateFormat\": \"yyyyMMdd\", \"resetPolicy\": \"day\", \"seqDigits\": 4}}, {\"type\": \"input\", \"field\": \"customerName\", \"title\": \"ÂÆ¢Êà∑ÂêçÁß∞\", \"props\": {\"placeholder\": \"ËØ∑ËæìÂÖ•ÂÆ¢Êà∑ÂêçÁß∞\"}, \"validate\": [{\"required\": true, \"message\": \"ÂÆ¢Êà∑ÂêçÁß∞‰∏çËÉΩ‰∏∫Á©∫\"}]}, {\"type\": \"dictSelect\", \"field\": \"customerLevel\", \"title\": \"ÂÆ¢Êà∑Á≠âÁ∫ß\", \"props\": {\"dictTypeCode\": \"customer_level\", \"placeholder\": \"ËØ∑ÈÄâÊã©ÂÆ¢Êà∑Á≠âÁ∫ß\", \"clearable\": true}}, {\"type\": \"areaPicker\", \"field\": \"visitRegion\", \"title\": \"ÊãúËÆøÂå∫Âüü\", \"props\": {\"placeholder\": \"ËØ∑ÈÄâÊã©ÁúÅ/Â∏Ç/Âå∫\", \"clearable\": true, \"showAllLevels\": true}}]}, {\"type\": \"elCard\", \"props\": {\"header\": \"Áé∞Âú∫‰ø°ÊÅØ\", \"shadow\": \"never\"}, \"style\": {\"width\": \"100%\"}, \"children\": [{\"type\": \"LocationPicker\", \"field\": \"visitLocation\", \"title\": \"Áé∞Âú∫ÂÆö‰Ωç\", \"props\": {\"placeholder\": \"ÁÇπÂáªÈÄâÊã©‰ΩçÁΩÆ\", \"clearable\": true}}, {\"type\": \"input\", \"field\": \"visitSummary\", \"title\": \"ÊãúËÆøÁ∫™Ë¶Å\", \"props\": {\"type\": \"textarea\", \"placeholder\": \"Â°´ÂÜôÁé∞Âú∫Ê≤üÈÄöË¶ÅÁÇπ\"}}, {\"type\": \"DrawerContainer\", \"props\": {\"buttonText\": \"Â±ïÂºÄËØ¶ÁªÜË∑üËøõËÆ°Âàí\", \"buttonType\": \"primary\", \"plain\": true, \"title\": \"ËØ¶ÁªÜË∑üËøõËÆ°Âàí\", \"size\": \"50%\"}, \"style\": {\"width\": \"100%\"}, \"children\": [{\"type\": \"input\", \"field\": \"competitor\", \"title\": \"Á´ûÂìÅÊÉÖÂÜµ\", \"props\": {\"placeholder\": \"ÂÆ¢Êà∑ÂΩìÂâç‰ΩøÁî®ÁöÑÁ´ûÂìÅÂèäËØÑ‰ª∑\"}}, {\"type\": \"input\", \"field\": \"followPlan\", \"title\": \"ÂêéÁª≠ËÆ°Âàí\", \"props\": {\"type\": \"textarea\", \"placeholder\": \"‰∏ã‰∏ÄÊ≠•Ë∑üËøõÂä®‰Ωú‰∏éÊó∂Èó¥ÁÇπ\"}}]}]}, {\"type\": \"elCard\", \"props\": {\"header\": \"ÂÆ¢Êà∑ÂÖ≥ËÅîÔºàÂÆûÊó∂Ê°£Ê°àÔºâ\", \"shadow\": \"never\"}, \"style\": {\"width\": \"100%\"}, \"children\": [{\"type\": \"dataPicker\", \"field\": \"relCustomer\", \"title\": \"ÂÖ≥ËÅîÂÆ¢Êà∑\", \"props\": {\"columns\": [\"Fyczmv3ks22dabc\", \"Ffxemv3ksch9aec\", \"Fzgimv3kskiaahc\", \"Fqgomv3ksnqrakc\"], \"searchColumns\": [\"Fyczmv3ks22dabc\"], \"sourceFormKey\": \"cust_rel_demo\", \"displayField\": \"Fyczmv3ks22dabc\", \"maxCount\": 1}}, {\"type\": \"RelationCard\", \"field\": \"custCard\", \"title\": \"ÂÆ¢Êà∑ÂÆûÊó∂Ê°£Ê°à\", \"props\": {\"title\": \"ÂÆ¢Êà∑ÂÆûÊó∂Ê°£Ê°à\", \"description\": \"ÈÄâÊã©ÂÆ¢Êà∑ÂêéÂÆûÊó∂Â±ïÁ§∫ÂÖ∂ÊúÄÊñ∞Ê°£Ê°àÔºàÈùûÂø´ÁÖßÔºâ\", \"globalDataSourceId\": \"a4187314fe3342c1ac5d6d52cc099a18\", \"recordIdField\": \"relCustomer\", \"displayFields\": [\"Fyczmv3ks22dabc\", \"Ffxemv3ksch9aec\", \"Fzgimv3kskiaahc\", \"Fqgomv3ksnqrakc\"], \"clickable\": true}}]}]}], \"option\": {\"form\": {\"inline\": false, \"labelPosition\": \"right\", \"size\": \"default\", \"labelWidth\": \"110px\", \"formCreateFormName\": \"ÂÆ¢Êà∑ÊãúËÆøÂ∑•Âçï-ÁªÑ‰ª∂ÊºîÁ§∫\"}, \"resetBtn\": {\"show\": false, \"innerText\": \"ÈáçÁΩÆ\"}, \"submitBtn\": {\"show\": true, \"innerText\": \"Êèê‰∫§\"}}, \"dataSources\": []}','PUBLISHED','default','BUSINESS','2026-10-11 14:09:18.462354',1),
('fe5b9d00f241420884f468d61e0c31fe','[{\"key\":\"Fyczmv3ks22dabc\",\"label\":\"ÂÆ¢Êà∑ÂêçÁß∞\",\"columnType\":\"VARCHAR\",\"length\":255,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"componentType\":\"input\"},{\"key\":\"Ffxemv3ksch9aec\",\"label\":\"ÂÆ¢Êà∑Áä∂ÊÄÅ\",\"columnType\":\"JSON\",\"length\":null,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"componentType\":\"select\"},{\"key\":\"Ffxemv3ksch9aec_text\",\"label\":\"ÂÆ¢Êà∑Áä∂ÊÄÅÔºàÊòæÁ§∫Ôºâ\",\"columnType\":\"VARCHAR\",\"length\":255,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"hidden\":true,\"componentType\":\"selectText\"},{\"key\":\"Fzgimv3kskiaahc\",\"label\":\"Ë¥üË¥£‰∫∫\",\"columnType\":\"VARCHAR\",\"length\":255,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"componentType\":\"input\"},{\"key\":\"Fqgomv3ksnqrakc\",\"label\":\"ËÅîÁ≥ªÁîµËØù\",\"columnType\":\"VARCHAR\",\"length\":255,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"componentType\":\"input\"}]','2026-10-11 08:42:26.008147',NULL,'cust_rel_demo','ÂÆ¢Êà∑Ê°£Ê°à-ÂÖ≥ËÅîÊºîÁ§∫',NULL,1,'{\"rule\":[{\"type\":\"input\",\"field\":\"Fyczmv3ks22dabc\",\"title\":\"ÂÆ¢Êà∑ÂêçÁß∞\",\"info\":\"\",\"$required\":false,\"_fc_id\":\"id_Ff60mv3ks22dacc\",\"name\":\"ref_Fjiamv3ks22dadc\",\"_fc_drag_tag\":\"input\",\"display\":true,\"hidden\":false},{\"type\":\"select\",\"field\":\"Ffxemv3ksch9aec\",\"title\":\"ÂÆ¢Êà∑Áä∂ÊÄÅ\",\"info\":\"\",\"effect\":{\"fetch\":\"\"},\"$required\":false,\"options\":[{\"label\":\"ËøêË°å‰∏≠\",\"value\":\"ËøêË°å‰∏≠\"},{\"label\":\"Á≠πÂª∫‰∏≠\",\"value\":\"Á≠πÂª∫‰∏≠\"},{\"label\":\"Â∑≤ÂÅúÁî®\",\"value\":\"Â∑≤ÂÅúÁî®\"}],\"_fc_id\":\"id_Fuiwmv3ksch9afc\",\"name\":\"ref_Fe7wmv3ksch9agc\",\"_fc_drag_tag\":\"select\",\"display\":true,\"hidden\":false},{\"type\":\"input\",\"field\":\"Fzgimv3kskiaahc\",\"title\":\"Ë¥üË¥£‰∫∫\",\"info\":\"\",\"$required\":false,\"_fc_id\":\"id_Fx77mv3kskiaaic\",\"name\":\"ref_Ffpwmv3kskiaajc\",\"_fc_drag_tag\":\"input\",\"display\":true,\"hidden\":false},{\"type\":\"input\",\"field\":\"Fqgomv3ksnqrakc\",\"title\":\"ËÅîÁ≥ªÁîµËØù\",\"info\":\"\",\"$required\":false,\"_fc_id\":\"id_Ficymv3ksnqralc\",\"name\":\"ref_Fm2fmv3ksnqramc\",\"_fc_drag_tag\":\"input\",\"display\":true,\"hidden\":false}],\"option\":{\"form\":{\"inline\":false,\"hideRequiredAsterisk\":false,\"labelPosition\":\"right\",\"size\":\"default\",\"labelWidth\":\"125px\",\"formCreateFormName\":\"ÂÆ¢Êà∑Ê°£Ê°à-ÂÖ≥ËÅîÊºîÁ§∫\"},\"resetBtn\":{\"show\":false,\"innerText\":\"ÈáçÁΩÆ\"},\"submitBtn\":{\"show\":true,\"innerText\":\"Êèê‰∫§\"},\"formName\":\"ÂÆ¢Êà∑Ê°£Ê°à-ÂÖ≥ËÅîÊºîÁ§∫\"},\"dataSources\":[],\"actions\":[]}','PUBLISHED','default','BUSINESS','2026-10-11 08:46:48.981497',1),
('seed_member_group_form','[{\"key\":\"group_name\",\"label\":\"ÊàêÂëòÁªÑÂêçÁß∞\",\"columnType\":\"VARCHAR\",\"length\":255,\"scale\":null,\"required\":true,\"unique\":false,\"indexed\":false,\"componentType\":\"input\"},{\"key\":\"description\",\"label\":\"ÊàêÂëòÁªÑËØ¥Êòé\",\"columnType\":\"TEXT\",\"length\":null,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"componentType\":\"textarea\"},{\"key\":\"members\",\"label\":\"ÁªÑÊàêÂëò\",\"columnType\":\"TEXT\",\"length\":null,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"componentType\":\"dataPicker\",\"pickerConfig\":\"{\\\"dataSourceId\\\":\\\"ds-builtin-user-tree\\\",\\\"displayField\\\":\\\"nickname\\\",\\\"pickerType\\\":\\\"dataPicker\\\"}\"},{\"key\":\"members_text\",\"label\":\"ÁªÑÊàêÂëòÔºàÊòæÁ§∫Ôºâ\",\"columnType\":\"TEXT\",\"length\":null,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"hidden\":true,\"componentType\":\"dataPickerText\"},{\"key\":\"post_rules\",\"label\":\"Ëá™Âä®ËßÑÂàô¬∑ÊåâÂ≤ó‰Ωç\",\"columnType\":\"TEXT\",\"length\":null,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"componentType\":\"dataPicker\",\"pickerConfig\":\"{\\\"dataSourceId\\\":\\\"ds-builtin-sys-posts\\\",\\\"displayField\\\":\\\"postName\\\",\\\"pickerType\\\":\\\"dataPicker\\\"}\"},{\"key\":\"post_rules_text\",\"label\":\"Ëá™Âä®ËßÑÂàô¬∑ÊåâÂ≤ó‰ΩçÔºàÊòæÁ§∫Ôºâ\",\"columnType\":\"TEXT\",\"length\":null,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"hidden\":true,\"componentType\":\"dataPickerText\"},{\"key\":\"org_rules\",\"label\":\"Ëá™Âä®ËßÑÂàô¬∑ÊåâÁªÑÁªá\",\"columnType\":\"TEXT\",\"length\":null,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"componentType\":\"dataPicker\",\"pickerConfig\":\"{\\\"dataSourceId\\\":\\\"ds-builtin-dept-tree\\\",\\\"displayField\\\":\\\"label\\\",\\\"pickerType\\\":\\\"dataPicker\\\"}\"},{\"key\":\"org_rules_text\",\"label\":\"Ëá™Âä®ËßÑÂàô¬∑ÊåâÁªÑÁªáÔºàÊòæÁ§∫Ôºâ\",\"columnType\":\"TEXT\",\"length\":null,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"hidden\":true,\"componentType\":\"dataPickerText\"}]','2026-10-11 22:17:36.026011','system','member_group','ÊàêÂëòÁªÑ',NULL,1,'{\"rule\":[{\"type\":\"input\",\"field\":\"group_name\",\"title\":\"ÊàêÂëòÁªÑÂêçÁß∞\",\"value\":\"\",\"info\":\"\",\"effect\":{\"fetch\":\"\"},\"$required\":true,\"validate\":[{\"required\":true,\"message\":\"ËØ∑ËæìÂÖ•ÊàêÂëòÁªÑÂêçÁß∞\",\"trigger\":\"blur\"}],\"_fc_drag_tag\":\"input\",\"display\":true,\"hidden\":false},{\"type\":\"input\",\"field\":\"description\",\"title\":\"ÊàêÂëòÁªÑËØ¥Êòé\",\"value\":\"\",\"props\":{\"type\":\"textarea\",\"rows\":2,\"maxlength\":255,\"placeholder\":\"ËØ∑ËæìÂÖ•ÊàêÂëòÁªÑËØ¥Êòé\"},\"_fc_drag_tag\":\"input\",\"display\":true,\"hidden\":false},{\"type\":\"dataPicker\",\"field\":\"members\",\"title\":\"ÁªÑÊàêÂëò\",\"value\":\"\",\"info\":\"‰ªéÁ≥ªÁªüÁî®Êà∑‰∏≠ÂºïÁî®ÔºåÂºπÁ™óÂ§öÈÄâ\",\"props\":{\"dataSourceId\":\"ds-builtin-user-tree\",\"displayField\":\"nickname\",\"columns\":[\"username\",\"nickname\",\"orgName\"],\"searchColumns\":[\"username\",\"nickname\"],\"placeholder\":\"ÁÇπÂáªÈÄâÊã©ÁªÑÊàêÂëòÔºàÂèØÂ§öÈÄâÔºâ\"},\"_fc_drag_tag\":\"dataPicker\",\"display\":true,\"hidden\":false},{\"type\":\"dataPicker\",\"field\":\"post_rules\",\"title\":\"Ëá™Âä®ËßÑÂàô¬∑ÊåâÂ≤ó‰Ωç\",\"value\":\"\",\"info\":\"ÂëΩ‰∏≠Â≤ó‰ΩçÁöÑÁî®Êà∑Ëá™Âä®ÂΩíÂ±ûÊú¨ÁªÑ\",\"props\":{\"dataSourceId\":\"ds-builtin-sys-posts\",\"displayField\":\"postName\",\"columns\":[\"postName\",\"postCode\",\"description\"],\"searchColumns\":[\"postName\",\"postCode\"],\"placeholder\":\"ÁÇπÂáªÈÄâÊã©Â≤ó‰ΩçÔºàÂèØÂ§öÈÄâÔºâ\"},\"_fc_drag_tag\":\"dataPicker\",\"display\":true,\"hidden\":false},{\"type\":\"dataPicker\",\"field\":\"org_rules\",\"title\":\"Ëá™Âä®ËßÑÂàô¬∑ÊåâÁªÑÁªá\",\"value\":\"\",\"info\":\"ÂëΩ‰∏≠ÁªÑÁªáÊú∫ÊûÑÁöÑÁî®Êà∑Ëá™Âä®ÂΩíÂ±ûÊú¨ÁªÑ\",\"props\":{\"dataSourceId\":\"ds-builtin-dept-tree\",\"displayField\":\"label\",\"columns\":[\"label\",\"code\"],\"searchColumns\":[\"label\",\"code\"],\"placeholder\":\"ÁÇπÂáªÈÄâÊã©ÁªÑÁªáÊú∫ÊûÑÔºàÂèØÂ§öÈÄâÔºâ\"},\"_fc_drag_tag\":\"dataPicker\",\"display\":true,\"hidden\":false}],\"option\":{\"form\":{\"inline\":false,\"labelPosition\":\"right\",\"labelWidth\":\"120px\",\"size\":\"default\"}},\"dataSources\":[{\"id\":\"ds-builtin-user-tree\",\"refId\":\"ds-builtin-user-tree\",\"name\":\"Á≥ªÁªüÁî®Êà∑\"},{\"id\":\"ds-builtin-sys-posts\",\"refId\":\"ds-builtin-sys-posts\",\"name\":\"Á≥ªÁªüÂ≤ó‰Ωç\"},{\"id\":\"ds-builtin-dept-tree\",\"refId\":\"ds-builtin-dept-tree\",\"name\":\"ÁªÑÁªáÊú∫ÊûÑ\"}]}','PUBLISHED','default','BUSINESS','2026-10-11 22:17:36.026011',1);
/*!40000 ALTER TABLE `wf_form_def` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_form_logic_binding`
--

DROP TABLE IF EXISTS `wf_form_logic_binding`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_form_logic_binding` (
  `id` varchar(64) NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `description` varchar(500) DEFAULT NULL,
  `enabled` bit(1) NOT NULL,
  `execution_mode` varchar(20) NOT NULL,
  `flow_key` varchar(64) NOT NULL,
  `form_key` varchar(64) NOT NULL,
  `form_type` varchar(20) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `trigger_type` varchar(32) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_form_logic_binding` (`tenant_id`,`form_type`,`form_key`,`trigger_type`,`flow_key`),
  KEY `idx_flb_form` (`tenant_id`,`form_type`,`form_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_form_logic_binding`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_form_logic_binding` WRITE;
/*!40000 ALTER TABLE `wf_form_logic_binding` DISABLE KEYS */;
INSERT INTO `wf_form_logic_binding` VALUES
('49ce8ca46d534232ad6e8cb9ed6d5fea','2026-10-11 16:06:32.857619','È¢ÜÁî®ÁôªËÆ∞ÂêéËá™Âä®Êâ£Â∫ìÂ≠ò+ÂÜôÊµÅÊ∞¥',0x01,'SYNC_IN_TX','pickup_stock_sync','material_pickup_demo','BUSINESS','default','AFTER_CREATE','2026-10-11 16:06:32.857624'),
('9cdac1767abe4b6e906defb2d49ca6f9','2026-10-11 16:06:31.583402','ÊµÅÁ®ãÁªìÊùüÂêéËá™Âä®ÂêåÊ≠•Âπ¥ÂÅáÂè∞Ë¥¶',0x01,'SYNC_IN_TX','leave_ledger_sync','leave_apply_demo','WORKFLOW','default','AFTER_PROCESS_FINISH','2026-10-11 16:06:31.583412');
/*!40000 ALTER TABLE `wf_form_logic_binding` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_logic_flow`
--

DROP TABLE IF EXISTS `wf_logic_flow`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_logic_flow` (
  `id` varchar(64) NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `description` varchar(500) DEFAULT NULL,
  `dsl_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`dsl_json`)),
  `flow_key` varchar(64) NOT NULL,
  `name` varchar(128) NOT NULL,
  `status` varchar(20) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `version` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_logic_flow_key` (`tenant_id`,`flow_key`),
  KEY `idx_logic_flow_key` (`flow_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_logic_flow`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_logic_flow` WRITE;
/*!40000 ALTER TABLE `wf_logic_flow` DISABLE KEYS */;
INSERT INTO `wf_logic_flow` VALUES
('31466d6915d44c5dab2e00821233a24f','2026-10-11 16:06:31.518530','ÊºîÁ§∫ÔºöÂÆ°ÊâπÈÄöËøá(ÊµÅÁ®ãÁªìÊùü)ÂêéËá™Âä®Âª∫Ê°£Âπ∂Á¥ØÂä†Âπ¥ÂÅáÂè∞Ë¥¶ÔºàDATA_UPSERT + DATA_UPDATEÔºâ','{\"nodes\": [{\"id\": \"start1\", \"type\": \"START\", \"name\": \"ÂºÄÂßã\", \"x\": 80, \"y\": 60}, {\"id\": \"dq_ledger\", \"type\": \"DATA_QUERY\", \"name\": \"Êü•ËØ¢Âè∞Ë¥¶ÊòØÂê¶Â∑≤Âª∫Ê°£\", \"x\": 80, \"y\": 176, \"config\": {\"formKey\": \"leave_ledger_demo\", \"filter\": [{\"column\": \"employeeName\", \"value\": \"{{formData.applicant}}\"}], \"size\": 1}, \"results\": [{\"name\": \"total\", \"mode\": \"KEY\", \"type\": \"number\", \"desc\": \"ÂëΩ‰∏≠Ë°åÊï∞\"}], \"errorAction\": \"FAIL_FLOW\"}, {\"id\": \"cond_empty\", \"type\": \"CONDITION\", \"name\": \"Âè∞Ë¥¶‰∏çÂ≠òÂú®?\", \"x\": 80, \"y\": 310, \"config\": {\"variable\": \"total\", \"operator\": \"EQ\", \"value\": \"0\"}}, {\"id\": \"di_create\", \"type\": \"DATA_INSERT\", \"name\": \"È¶ñÊ¨°Ëá™Âä®Âª∫Ê°£(ÊÄªÈ¢ù10Â§©)\", \"x\": 80, \"y\": 426, \"config\": {\"formKey\": \"leave_ledger_demo\", \"data\": [{\"column\": \"employeeName\", \"value\": \"{{formData.applicant}}\"}, {\"column\": \"department\", \"value\": \"{{formData.department}}\"}, {\"column\": \"annualDays\", \"value\": \"10\"}, {\"column\": \"usedDays\", \"value\": \"0\"}]}, \"errorAction\": \"FAIL_FLOW\"}, {\"id\": \"du_add\", \"type\": \"DATA_UPDATE\", \"name\": \"Á¥ØÂä†Â∑≤Áî®Â§©Êï∞\", \"x\": 80, \"y\": 542, \"config\": {\"table\": \"\", \"setOps\": [], \"where\": [], \"updates\": [{\"table\": \"wf_biz_leave_ledger_demo\", \"setOps\": [{\"column\": \"usedDays\", \"mode\": \"ADD\", \"value\": \"{{formData.days}}\"}], \"where\": [{\"column\": \"employeeName\", \"op\": \"EQ\", \"value\": \"{{formData.applicant}}\"}]}]}, \"errorAction\": \"FAIL_FLOW\"}, {\"id\": \"end1\", \"type\": \"END\", \"name\": \"ÁªìÊùü\", \"x\": 80, \"y\": 658}], \"edges\": [{\"source\": \"start1\", \"target\": \"dq_ledger\", \"id\": \"e1\"}, {\"source\": \"du_add\", \"target\": \"end1\", \"id\": \"e6\"}, {\"source\": \"cond_empty\", \"target\": \"di_create\", \"id\": \"e_true_create\", \"branch\": \"true\"}, {\"source\": \"cond_empty\", \"target\": \"du_add\", \"id\": \"e_false_add\", \"branch\": \"false\"}, {\"source\": \"di_create\", \"target\": \"du_add\", \"id\": \"e_create_add\"}, {\"id\": \"e2\", \"source\": \"dq_ledger\", \"target\": \"cond_empty\"}]}','leave_ledger_sync','ËØ∑ÂÅáÊâπÂáÜÂêåÊ≠•Âπ¥ÂÅáÂè∞Ë¥¶','PUBLISHED','default','2026-10-11 17:29:52.651177',10),
('88bcfe0b7a1742a7b09a3286012a78b9','2026-10-08 01:04:24.119650',NULL,'{\"nodes\":[{\"id\":\"start\",\"type\":\"START\",\"name\":\"ÂºÄÂßã\",\"x\":360.0,\"y\":80.0,\"config\":null,\"resultVar\":null,\"errorAction\":null},{\"id\":\"end\",\"type\":\"END\",\"name\":\"ÁªìÊùü\",\"x\":360.0,\"y\":320.0,\"config\":null,\"resultVar\":null,\"errorAction\":null}],\"edges\":[{\"id\":\"e1\",\"source\":\"start\",\"target\":\"end\",\"branch\":null}],\"inputVars\":null}','var_picker_test','ÂèòÈáèÈÄâÊã©Âô®ÊµãËØïÊµÅ','DRAFT','default','2026-10-08 01:04:24.119670',0),
('fbefdda018464d64ad24fbda9ecc349e','2026-10-11 16:06:32.813624','ÊºîÁ§∫ÔºöÁôªËÆ∞È¢ÜÁî®Âçï(Êñ∞Â¢û)ÂêéËá™Âä®Êâ£ÂáèÁâ©ÊñôÂ∫ìÂ≠ò(DATA_UPDATE SUB)Âπ∂ÂÜôÂÖ•È¢ÜÁî®ÊµÅÊ∞¥(DATA_INSERT)','{\"nodes\":[{\"id\":\"start1\",\"type\":\"START\",\"name\":\"ÂºÄÂßã\",\"x\":80,\"y\":60},{\"id\":\"du_stock\",\"type\":\"DATA_UPDATE\",\"name\":\"Êâ£ÂáèÁâ©ÊñôÂ∫ìÂ≠ò\",\"x\":80,\"y\":176,\"config\":{\"table\":\"wf_biz_material_stock_demo\",\"setOps\":[{\"column\":\"stockQty\",\"mode\":\"SUB\",\"value\":\"{{formData.qty}}\"}],\"where\":[{\"column\":\"productCode\",\"op\":\"EQ\",\"value\":\"{{formData.productCode}}\"}]},\"errorAction\":\"FAIL_FLOW\"},{\"id\":\"di_log\",\"type\":\"DATA_INSERT\",\"name\":\"ÂÜôÂÖ•È¢ÜÁî®ÊµÅÊ∞¥\",\"x\":80,\"y\":292,\"config\":{\"formKey\":\"pickup_log_demo\",\"data\":[{\"column\":\"productCode\",\"value\":\"{{formData.productCode}}\"},{\"column\":\"productName\",\"value\":\"{{formData.productName}}\"},{\"column\":\"qty\",\"value\":\"{{formData.qty}}\"},{\"column\":\"pickupBy\",\"value\":\"{{formData.pickupBy}}\"},{\"column\":\"sourceNote\",\"value\":\"Êù•Ê∫êÈ¢ÜÁî®Âçï {{dataId}}\"}]},\"errorAction\":\"FAIL_FLOW\"},{\"id\":\"end1\",\"type\":\"END\",\"name\":\"ÁªìÊùü\",\"x\":80,\"y\":408}],\"edges\":[{\"source\":\"start1\",\"target\":\"du_stock\",\"id\":\"e1\"},{\"source\":\"du_stock\",\"target\":\"di_log\",\"id\":\"e2\"},{\"source\":\"di_log\",\"target\":\"end1\",\"id\":\"e3\"}]}','pickup_stock_sync','È¢ÜÁî®ÁôªËÆ∞ËÅîÂä®Â∫ìÂ≠ò‰∏éÊµÅÊ∞¥','PUBLISHED','default','2026-10-12 02:02:38.564827',9);
/*!40000 ALTER TABLE `wf_logic_flow` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_logic_flow_run`
--

DROP TABLE IF EXISTS `wf_logic_flow_run`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_logic_flow_run` (
  `id` varchar(64) NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `duration_ms` bigint(20) NOT NULL,
  `error_message` text DEFAULT NULL,
  `flow_id` varchar(64) NOT NULL,
  `flow_key` varchar(64) NOT NULL,
  `flow_name` varchar(128) DEFAULT NULL,
  `input_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`input_json`)),
  `output_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`output_json`)),
  `started_at` datetime(6) DEFAULT NULL,
  `status` varchar(20) NOT NULL,
  `traces_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`traces_json`)),
  PRIMARY KEY (`id`),
  KEY `idx_lfr_flow_id` (`flow_id`),
  KEY `idx_lfr_flow_key` (`flow_key`),
  KEY `idx_lfr_flow_name` (`flow_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_logic_flow_run`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_logic_flow_run` WRITE;
/*!40000 ALTER TABLE `wf_logic_flow_run` DISABLE KEYS */;
INSERT INTO `wf_logic_flow_run` VALUES
('0a196be6241948409365bceca8f69cbf','2026-10-12 02:22:57.688007',31,NULL,'fbefdda018464d64ad24fbda9ecc349e','pickup_stock_sync','È¢ÜÁî®ÁôªËÆ∞ËÅîÂä®Â∫ìÂ≠ò‰∏éÊµÅÊ∞¥','{\"formData\":{\"productCode\":\"P003\",\"qty\":2,\"reason\":\"ÂõûÂΩíÊµãËØï\"}}','{\"formData\":{\"productCode\":\"P003\",\"qty\":2,\"reason\":\"ÂõûÂΩíÊµãËØï\"},\"du_stock\":1,\"di_log\":{\"id\":\"4e2d02adb9c246e0a1bde932fcaafa4d\",\"version\":1,\"data\":{\"productCode\":\"P003\",\"qty\":2,\"sourceNote\":\"Êù•Ê∫êÈ¢ÜÁî®Âçï \"}}}','2026-10-12 02:22:57.655380','SUCCESS','[{\"nodeId\":\"start1\",\"nodeName\":\"ÂºÄÂßã\",\"type\":\"START\",\"status\":\"SUCCESS\",\"result\":null,\"error\":null,\"durationMs\":\"0\"},{\"nodeId\":\"du_stock\",\"nodeName\":\"Êâ£ÂáèÁâ©ÊñôÂ∫ìÂ≠ò\",\"type\":\"DATA_UPDATE\",\"status\":\"SUCCESS\",\"result\":1,\"error\":null,\"durationMs\":\"8\"},{\"nodeId\":\"di_log\",\"nodeName\":\"ÂÜôÂÖ•È¢ÜÁî®ÊµÅÊ∞¥\",\"type\":\"DATA_INSERT\",\"status\":\"SUCCESS\",\"result\":{\"id\":\"4e2d02adb9c246e0a1bde932fcaafa4d\",\"version\":1,\"data\":{\"productCode\":\"P003\",\"qty\":2,\"sourceNote\":\"Êù•Ê∫êÈ¢ÜÁî®Âçï \"}},\"error\":null,\"durationMs\":\"23\"},{\"nodeId\":\"end1\",\"nodeName\":\"ÁªìÊùü\",\"type\":\"END\",\"status\":\"SUCCESS\",\"result\":null,\"error\":null,\"durationMs\":\"0\"}]'),
('0c2f88b89b8549759152de1c5d0b7fa7','2026-10-12 03:23:24.793017',10,NULL,'fbefdda018464d64ad24fbda9ecc349e','pickup_stock_sync','È¢ÜÁî®ÁôªËÆ∞ËÅîÂä®Â∫ìÂ≠ò‰∏éÊµÅÊ∞¥','{\"formData\":{\"productCode\":\"P003\",\"qty\":2,\"reason\":\"ÂõûÂΩíÊµãËØï\"}}','{\"formData\":{\"productCode\":\"P003\",\"qty\":2,\"reason\":\"ÂõûÂΩíÊµãËØï\"},\"du_stock\":1,\"di_log\":{\"id\":\"3dca02a67bb84b55a1733dd5120d9689\",\"version\":1,\"data\":{\"productCode\":\"P003\",\"qty\":2,\"sourceNote\":\"Êù•Ê∫êÈ¢ÜÁî®Âçï \"}}}','2026-10-12 03:23:24.782317','SUCCESS','[{\"nodeId\":\"start1\",\"nodeName\":\"ÂºÄÂßã\",\"type\":\"START\",\"status\":\"SUCCESS\",\"result\":null,\"error\":null,\"durationMs\":\"0\"},{\"nodeId\":\"du_stock\",\"nodeName\":\"Êâ£ÂáèÁâ©ÊñôÂ∫ìÂ≠ò\",\"type\":\"DATA_UPDATE\",\"status\":\"SUCCESS\",\"result\":1,\"error\":null,\"durationMs\":\"2\"},{\"nodeId\":\"di_log\",\"nodeName\":\"ÂÜôÂÖ•È¢ÜÁî®ÊµÅÊ∞¥\",\"type\":\"DATA_INSERT\",\"status\":\"SUCCESS\",\"result\":{\"id\":\"3dca02a67bb84b55a1733dd5120d9689\",\"version\":1,\"data\":{\"productCode\":\"P003\",\"qty\":2,\"sourceNote\":\"Êù•Ê∫êÈ¢ÜÁî®Âçï \"}},\"error\":null,\"durationMs\":\"7\"},{\"nodeId\":\"end1\",\"nodeName\":\"ÁªìÊùü\",\"type\":\"END\",\"status\":\"SUCCESS\",\"result\":null,\"error\":null,\"durationMs\":\"0\"}]'),
('1c8e98b467924526a28de6d41d813611','2026-10-12 00:33:02.915193',20,NULL,'fbefdda018464d64ad24fbda9ecc349e','pickup_stock_sync','È¢ÜÁî®ÁôªËÆ∞ËÅîÂä®Â∫ìÂ≠ò‰∏éÊµÅÊ∞¥','{\"formData\":{\"productCode\":\"P001\",\"productName\":\"Ê∑±Ê≤üÁêÉËΩ¥Êâø 6204\",\"qty\":10,\"pickupBy\":\"Âº†‰∏â\"},\"formDataExisting\":null,\"formKey\":\"material_pickup_demo\",\"formType\":\"BUSINESS\",\"dataId\":\"ce941a897dd8413e8eb1a686eb4f2c9e\",\"opType\":\"CREATE\",\"operator\":\"admin\",\"__trigger\":{\"source\":\"form-submit\",\"formType\":\"BUSINESS\",\"formKey\":\"material_pickup_demo\",\"trigger\":\"AFTER_CREATE\",\"opType\":\"CREATE\"}}','{\"formData\":{\"productCode\":\"P001\",\"productName\":\"Ê∑±Ê≤üÁêÉËΩ¥Êâø 6204\",\"qty\":10,\"pickupBy\":\"Âº†‰∏â\"},\"formDataExisting\":null,\"formKey\":\"material_pickup_demo\",\"formType\":\"BUSINESS\",\"dataId\":\"ce941a897dd8413e8eb1a686eb4f2c9e\",\"opType\":\"CREATE\",\"operator\":\"admin\",\"__trigger\":{\"source\":\"form-submit\",\"formType\":\"BUSINESS\",\"formKey\":\"material_pickup_demo\",\"trigger\":\"AFTER_CREATE\",\"opType\":\"CREATE\"},\"du_stock\":1,\"di_log\":{\"id\":\"9710184373c148a083f518de244922ac\",\"version\":1,\"data\":{\"productCode\":\"P001\",\"productName\":\"Ê∑±Ê≤üÁêÉËΩ¥Êâø 6204\",\"qty\":10,\"pickupBy\":\"Âº†‰∏â\",\"sourceNote\":\"Êù•Ê∫êÈ¢ÜÁî®Âçï ce941a897dd8413e8eb1a686eb4f2c9e\"}}}','2026-10-12 00:33:02.876930','SUCCESS','[{\"nodeId\":\"start1\",\"nodeName\":\"ÂºÄÂßã\",\"type\":\"START\",\"status\":\"SUCCESS\",\"result\":null,\"error\":null,\"durationMs\":\"0\"},{\"nodeId\":\"du_stock\",\"nodeName\":\"Êâ£ÂáèÁâ©ÊñôÂ∫ìÂ≠ò\",\"type\":\"DATA_UPDATE\",\"status\":\"SUCCESS\",\"result\":1,\"error\":null,\"durationMs\":\"10\"},{\"nodeId\":\"di_log\",\"nodeName\":\"ÂÜôÂÖ•È¢ÜÁî®ÊµÅÊ∞¥\",\"type\":\"DATA_INSERT\",\"status\":\"SUCCESS\",\"result\":{\"id\":\"9710184373c148a083f518de244922ac\",\"version\":1,\"data\":{\"productCode\":\"P001\",\"productName\":\"Ê∑±Ê≤üÁêÉËΩ¥Êâø 6204\",\"qty\":10,\"pickupBy\":\"Âº†‰∏â\",\"sourceNote\":\"Êù•Ê∫êÈ¢ÜÁî®Âçï ce941a897dd8413e8eb1a686eb4f2c9e\"}},\"error\":null,\"durationMs\":\"8\"},{\"nodeId\":\"end1\",\"nodeName\":\"ÁªìÊùü\",\"type\":\"END\",\"status\":\"SUCCESS\",\"result\":null,\"error\":null,\"durationMs\":\"0\"}]'),
('65f839745e384a70b474467341b97ad1','2026-10-12 03:35:31.340668',29,NULL,'31466d6915d44c5dab2e00821233a24f','leave_ledger_sync','ËØ∑ÂÅáÊâπÂáÜÂêåÊ≠•Âπ¥ÂÅáÂè∞Ë¥¶','{\"formData\":{\"applicant\":\"ÂõûÂΩíÊµãËØïÂëò\",\"department\":\"Ë¥®Ê£ÄÈÉ®\",\"leaveType\":\"Âπ¥ÂÅá\",\"days\":1}}','{\"formData\":{\"applicant\":\"ÂõûÂΩíÊµãËØïÂëò\",\"department\":\"Ë¥®Ê£ÄÈÉ®\",\"leaveType\":\"Âπ¥ÂÅá\",\"days\":1},\"total\":\"0\",\"cond_empty\":true,\"di_create\":{\"id\":\"b8b19e552b2a483fb56acfd96ccbc05d\",\"version\":1,\"data\":{\"employeeName\":\"ÂõûÂΩíÊµãËØïÂëò\",\"department\":\"Ë¥®Ê£ÄÈÉ®\",\"annualDays\":10,\"usedDays\":0}},\"du_add\":1}','2026-10-12 03:35:31.309966','SUCCESS','[{\"nodeId\":\"start1\",\"nodeName\":\"ÂºÄÂßã\",\"type\":\"START\",\"status\":\"SUCCESS\",\"result\":null,\"error\":null,\"durationMs\":\"0\"},{\"nodeId\":\"dq_ledger\",\"nodeName\":\"Êü•ËØ¢Âè∞Ë¥¶ÊòØÂê¶Â∑≤Âª∫Ê°£\",\"type\":\"DATA_QUERY\",\"status\":\"SUCCESS\",\"result\":{\"total\":\"0\",\"page\":1,\"size\":1,\"rows\":[]},\"error\":null,\"durationMs\":\"16\"},{\"nodeId\":\"cond_empty\",\"nodeName\":\"Âè∞Ë¥¶‰∏çÂ≠òÂú®?\",\"type\":\"CONDITION\",\"status\":\"SUCCESS\",\"result\":\"true\",\"error\":null,\"durationMs\":\"0\"},{\"nodeId\":\"di_create\",\"nodeName\":\"È¶ñÊ¨°Ëá™Âä®Âª∫Ê°£(ÊÄªÈ¢ù10Â§©)\",\"type\":\"DATA_INSERT\",\"status\":\"SUCCESS\",\"result\":{\"id\":\"b8b19e552b2a483fb56acfd96ccbc05d\",\"version\":1,\"data\":{\"employeeName\":\"ÂõûÂΩíÊµãËØïÂëò\",\"department\":\"Ë¥®Ê£ÄÈÉ®\",\"annualDays\":10,\"usedDays\":0}},\"error\":null,\"durationMs\":\"6\"},{\"nodeId\":\"du_add\",\"nodeName\":\"Á¥ØÂä†Â∑≤Áî®Â§©Êï∞\",\"type\":\"DATA_UPDATE\",\"status\":\"SUCCESS\",\"result\":1,\"error\":null,\"durationMs\":\"6\"},{\"nodeId\":\"end1\",\"nodeName\":\"ÁªìÊùü\",\"type\":\"END\",\"status\":\"SUCCESS\",\"result\":null,\"error\":null,\"durationMs\":\"0\"}]'),
('893dd1c5a9e14fa89d5a669b39d3a811','2026-10-12 02:22:57.603368',18,NULL,'31466d6915d44c5dab2e00821233a24f','leave_ledger_sync','ËØ∑ÂÅáÊâπÂáÜÂêåÊ≠•Âπ¥ÂÅáÂè∞Ë¥¶','{\"formData\":{\"applicant\":\"ÂõûÂΩíÊµãËØïÂëò\",\"department\":\"Ë¥®Ê£ÄÈÉ®\",\"leaveType\":\"Âπ¥ÂÅá\",\"days\":1}}','{\"formData\":{\"applicant\":\"ÂõûÂΩíÊµãËØïÂëò\",\"department\":\"Ë¥®Ê£ÄÈÉ®\",\"leaveType\":\"Âπ¥ÂÅá\",\"days\":1},\"total\":\"0\",\"cond_empty\":true,\"di_create\":{\"id\":\"0f4b77d5082b4e4b8f91c39dd2b22d4f\",\"version\":1,\"data\":{\"employeeName\":\"ÂõûÂΩíÊµãËØïÂëò\",\"department\":\"Ë¥®Ê£ÄÈÉ®\",\"annualDays\":10,\"usedDays\":0}},\"du_add\":1}','2026-10-12 02:22:57.583861','SUCCESS','[{\"nodeId\":\"start1\",\"nodeName\":\"ÂºÄÂßã\",\"type\":\"START\",\"status\":\"SUCCESS\",\"result\":null,\"error\":null,\"durationMs\":\"0\"},{\"nodeId\":\"dq_ledger\",\"nodeName\":\"Êü•ËØ¢Âè∞Ë¥¶ÊòØÂê¶Â∑≤Âª∫Ê°£\",\"type\":\"DATA_QUERY\",\"status\":\"SUCCESS\",\"result\":{\"total\":\"0\",\"page\":1,\"size\":1,\"rows\":[]},\"error\":null,\"durationMs\":\"4\"},{\"nodeId\":\"cond_empty\",\"nodeName\":\"Âè∞Ë¥¶‰∏çÂ≠òÂú®?\",\"type\":\"CONDITION\",\"status\":\"SUCCESS\",\"result\":\"true\",\"error\":null,\"durationMs\":\"1\"},{\"nodeId\":\"di_create\",\"nodeName\":\"È¶ñÊ¨°Ëá™Âä®Âª∫Ê°£(ÊÄªÈ¢ù10Â§©)\",\"type\":\"DATA_INSERT\",\"status\":\"SUCCESS\",\"result\":{\"id\":\"0f4b77d5082b4e4b8f91c39dd2b22d4f\",\"version\":1,\"data\":{\"employeeName\":\"ÂõûÂΩíÊµãËØïÂëò\",\"department\":\"Ë¥®Ê£ÄÈÉ®\",\"annualDays\":10,\"usedDays\":0}},\"error\":null,\"durationMs\":\"5\"},{\"nodeId\":\"du_add\",\"nodeName\":\"Á¥ØÂä†Â∑≤Áî®Â§©Êï∞\",\"type\":\"DATA_UPDATE\",\"status\":\"SUCCESS\",\"result\":1,\"error\":null,\"durationMs\":\"8\"},{\"nodeId\":\"end1\",\"nodeName\":\"ÁªìÊùü\",\"type\":\"END\",\"status\":\"SUCCESS\",\"result\":null,\"error\":null,\"durationMs\":\"0\"}]'),
('e9773a796a164d25a326d16a774683ce','2026-10-12 03:35:31.439347',14,NULL,'fbefdda018464d64ad24fbda9ecc349e','pickup_stock_sync','È¢ÜÁî®ÁôªËÆ∞ËÅîÂä®Â∫ìÂ≠ò‰∏éÊµÅÊ∞¥','{\"formData\":{\"productCode\":\"P003\",\"qty\":2,\"reason\":\"ÂõûÂΩíÊµãËØï\"}}','{\"formData\":{\"productCode\":\"P003\",\"qty\":2,\"reason\":\"ÂõûÂΩíÊµãËØï\"},\"du_stock\":1,\"di_log\":{\"id\":\"404484a8fc7441a6beecaa9e70f425a4\",\"version\":1,\"data\":{\"productCode\":\"P003\",\"qty\":2,\"sourceNote\":\"Êù•Ê∫êÈ¢ÜÁî®Âçï \"}}}','2026-10-12 03:35:31.424127','SUCCESS','[{\"nodeId\":\"start1\",\"nodeName\":\"ÂºÄÂßã\",\"type\":\"START\",\"status\":\"SUCCESS\",\"result\":null,\"error\":null,\"durationMs\":\"0\"},{\"nodeId\":\"du_stock\",\"nodeName\":\"Êâ£ÂáèÁâ©ÊñôÂ∫ìÂ≠ò\",\"type\":\"DATA_UPDATE\",\"status\":\"SUCCESS\",\"result\":1,\"error\":null,\"durationMs\":\"3\"},{\"nodeId\":\"di_log\",\"nodeName\":\"ÂÜôÂÖ•È¢ÜÁî®ÊµÅÊ∞¥\",\"type\":\"DATA_INSERT\",\"status\":\"SUCCESS\",\"result\":{\"id\":\"404484a8fc7441a6beecaa9e70f425a4\",\"version\":1,\"data\":{\"productCode\":\"P003\",\"qty\":2,\"sourceNote\":\"Êù•Ê∫êÈ¢ÜÁî®Âçï \"}},\"error\":null,\"durationMs\":\"11\"},{\"nodeId\":\"end1\",\"nodeName\":\"ÁªìÊùü\",\"type\":\"END\",\"status\":\"SUCCESS\",\"result\":null,\"error\":null,\"durationMs\":\"0\"}]'),
('f1ddea4a79ff4fa7a45cf769c4546294','2026-10-12 03:23:24.703530',14,NULL,'31466d6915d44c5dab2e00821233a24f','leave_ledger_sync','ËØ∑ÂÅáÊâπÂáÜÂêåÊ≠•Âπ¥ÂÅáÂè∞Ë¥¶','{\"formData\":{\"applicant\":\"ÂõûÂΩíÊµãËØïÂëò\",\"department\":\"Ë¥®Ê£ÄÈÉ®\",\"leaveType\":\"Âπ¥ÂÅá\",\"days\":1}}','{\"formData\":{\"applicant\":\"ÂõûÂΩíÊµãËØïÂëò\",\"department\":\"Ë¥®Ê£ÄÈÉ®\",\"leaveType\":\"Âπ¥ÂÅá\",\"days\":1},\"total\":\"0\",\"cond_empty\":true,\"di_create\":{\"id\":\"6f42b10e24774d0da6c9b2d693cbd35e\",\"version\":1,\"data\":{\"employeeName\":\"ÂõûÂΩíÊµãËØïÂëò\",\"department\":\"Ë¥®Ê£ÄÈÉ®\",\"annualDays\":10,\"usedDays\":0}},\"du_add\":1}','2026-10-12 03:23:24.687776','SUCCESS','[{\"nodeId\":\"start1\",\"nodeName\":\"ÂºÄÂßã\",\"type\":\"START\",\"status\":\"SUCCESS\",\"result\":null,\"error\":null,\"durationMs\":\"0\"},{\"nodeId\":\"dq_ledger\",\"nodeName\":\"Êü•ËØ¢Âè∞Ë¥¶ÊòØÂê¶Â∑≤Âª∫Ê°£\",\"type\":\"DATA_QUERY\",\"status\":\"SUCCESS\",\"result\":{\"total\":\"0\",\"page\":1,\"size\":1,\"rows\":[]},\"error\":null,\"durationMs\":\"4\"},{\"nodeId\":\"cond_empty\",\"nodeName\":\"Âè∞Ë¥¶‰∏çÂ≠òÂú®?\",\"type\":\"CONDITION\",\"status\":\"SUCCESS\",\"result\":\"true\",\"error\":null,\"durationMs\":\"1\"},{\"nodeId\":\"di_create\",\"nodeName\":\"È¶ñÊ¨°Ëá™Âä®Âª∫Ê°£(ÊÄªÈ¢ù10Â§©)\",\"type\":\"DATA_INSERT\",\"status\":\"SUCCESS\",\"result\":{\"id\":\"6f42b10e24774d0da6c9b2d693cbd35e\",\"version\":1,\"data\":{\"employeeName\":\"ÂõûÂΩíÊµãËØïÂëò\",\"department\":\"Ë¥®Ê£ÄÈÉ®\",\"annualDays\":10,\"usedDays\":0}},\"error\":null,\"durationMs\":\"4\"},{\"nodeId\":\"du_add\",\"nodeName\":\"Á¥ØÂä†Â∑≤Áî®Â§©Êï∞\",\"type\":\"DATA_UPDATE\",\"status\":\"SUCCESS\",\"result\":1,\"error\":null,\"durationMs\":\"5\"},{\"nodeId\":\"end1\",\"nodeName\":\"ÁªìÊùü\",\"type\":\"END\",\"status\":\"SUCCESS\",\"result\":null,\"error\":null,\"durationMs\":\"0\"}]');
/*!40000 ALTER TABLE `wf_logic_flow_run` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_node_config`
--

DROP TABLE IF EXISTS `wf_node_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_node_config` (
  `id` varchar(64) NOT NULL,
  `config_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`config_json`)),
  `created_at` datetime(6) DEFAULT NULL,
  `node_id` varchar(255) NOT NULL,
  `node_type` varchar(64) NOT NULL,
  `process_def_id` varchar(64) NOT NULL,
  `process_definition_id` varchar(64) DEFAULT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_node_version` (`tenant_id`,`process_def_id`,`node_id`,`process_definition_id`),
  KEY `idx_def` (`tenant_id`,`process_def_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_node_config`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_node_config` WRITE;
/*!40000 ALTER TABLE `wf_node_config` DISABLE KEYS */;
INSERT INTO `wf_node_config` VALUES
('1f06871639a34d298fb406e0accb2c58','{\"basic\": {\"name\": \"Â§ö‰∫∫ÂÆ°Êâπ\"}, \"timeout\": {\"action\": \"remind\", \"duration\": 0}, \"approval\": {\"multiMode\": \"\"}, \"operations\": {\"allowReject\": true, \"allowAddSign\": false, \"allowDelegate\": false, \"allowTransfer\": true}}','2026-09-11 10:48:10.689698','Activity_0lwswse','userTask','be9204eac01647d69c2ed9423173b698',NULL,'default','2026-09-11 10:48:10.689698'),
('3c1aebc482f54fb483fbb1016f5c3fcd','{\"basic\": {\"name\": \"ÂéªÈáçÂÆ°Êâπ\"}, \"timeout\": {\"action\": \"remind\", \"duration\": 0}, \"approval\": {\"multiMode\": \"\"}, \"operations\": {\"allowReject\": true, \"allowAddSign\": false, \"allowDelegate\": false, \"allowTransfer\": true}}','2026-09-11 10:48:10.689698','Activity_1tsdpa6','userTask','be9204eac01647d69c2ed9423173b698',NULL,'default','2026-09-11 10:48:10.689698'),
('4caff91662f04edb8debaa9a3502910a','{\"form\": {\"formDefId\": \"757332f798b545efa453fa37669a9193\", \"fieldPermissions\": {}}}','2026-10-11 16:21:55.444546','__PROCESS__','process','4e490b3fe5bb4616952d03bba14329a8',NULL,'default','2026-10-11 16:21:55.444550'),
('620c09cff56403f62728b00748a26e93','{\"approvalPolicy\":{\"deduplication\":{\"enabled\":false,\"scope\":\"GLOBAL\",\"mode\":\"CONSECUTIVE\",\"action\":\"AUTO_PASS\",\"skipSameAsInitiator\":false},\"operations\":{\"allowReject\":true,\"allowAddSign\":true,\"allowTransfer\":true,\"allowDelegate\":true},\"commentPolicy\":{\"enabled\":false,\"scope\":\"REJECT_RETURN\"},\"signaturePolicy\":{\"enabled\":false,\"useLast\":false,\"allowUpload\":false,\"required\":false},\"comment\":{\"disabled\":false,\"disallowDelete\":false,\"disallowAttachment\":false},\"approveRecall\":false,\"retakeSkipApproved\":false},\"titleRule\":{\"enabled\":false,\"pattern\":\"\"},\"summaryRule\":{\"enabled\":false,\"fields\":[],\"showInSms\":false},\"dynamicProcess\":false,\"timeoutRules\":[],\"starterScope\":{\"mode\":\"ALL\",\"userIds\":[],\"roleIds\":[]},\"adminUserIds\":[],\"numberRule\":{\"enabled\":false,\"pattern\":\"{{year}}-{{seq:4}}\"}}','2026-09-30 01:42:56.000000','__PROCESS__','unknown','f50d6d7a012aea6df8710a35de24b267',NULL,'default','2026-09-30 01:42:56.000000'),
('d9cbc57b706644bfaac87340c52e2fd3','{\"form\": {\"formDefId\": \"757332f798b545efa453fa37669a9193\", \"fieldPermissions\": {}}}','2026-10-11 16:21:55.526920','__PROCESS__','process','4e490b3fe5bb4616952d03bba14329a8','leave_approval_demo:9:e00dec0a-c58f-11f1-92ce-b6a8b1076472','default','2026-10-11 16:21:55.526923'),
('e8205c45a7364b6cb6fd6faedd930072','{\"numberRule\": {\"enabled\": false, \"pattern\": \"{{year}}-{{seq:4}}\"}, \"approvalPolicy\": {\"operations\": {\"allowReject\": true, \"allowAddSign\": true, \"allowDelegate\": true, \"allowTransfer\": true}, \"allowRecall\": true, \"deduplication\": {\"scope\": \"GLOBAL\", \"action\": \"AUTO_PASS\", \"enabled\": false}}}','2026-09-11 10:48:10.689184','__PROCESS__','process','be9204eac01647d69c2ed9423173b698',NULL,'default','2026-09-11 10:48:10.689184');
/*!40000 ALTER TABLE `wf_node_config` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_page_def`
--

DROP TABLE IF EXISTS `wf_page_def`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_page_def` (
  `id` varchar(64) NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `data_source_id` varchar(64) DEFAULT NULL,
  `form_key` varchar(255) DEFAULT NULL,
  `key` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `published_version` int(11) DEFAULT NULL,
  `schema` longtext DEFAULT NULL,
  `status` varchar(32) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `type` varchar(32) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `version` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_page_def_tenant_key_version` (`tenant_id`,`key`,`version`),
  KEY `idx_page_def_tenant_form` (`tenant_id`,`form_key`),
  KEY `idx_page_def_tenant_status` (`tenant_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_page_def`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_page_def` WRITE;
/*!40000 ALTER TABLE `wf_page_def` DISABLE KEYS */;
INSERT INTO `wf_page_def` VALUES
('7967506e1d644f61b6990610ee8c65f2','2026-10-11 15:15:27.401829',NULL,NULL,NULL,'page_detail_steps_demo','ÁªÑ‰ª∂ÊºîÁ§∫¬∑Êï∞ÊçÆËØ¶ÊÉÖ‰∏éÊ≠•È™§Êù°',1,'{\"rule\":[{\"type\":\"page-steps\",\"field\":\"stepsDemo1\",\"title\":\"ÂÆ¢Êà∑ÊúçÂä°ÊµÅÁ®ã\",\"props\":{\"items\":[{\"title\":\"ÁôªËÆ∞ÂèóÁêÜ\",\"description\":\"ÂàõÂª∫ÂÆ¢Êà∑Ê°£Ê°à\"},{\"title\":\"ÈúÄÊ±ÇÁ°ÆËÆ§\",\"description\":\"Á°ÆËÆ§ÊúçÂä°ÊñπÊ°à\"},{\"title\":\"Áé∞Âú∫ÂÆûÊñΩ\",\"description\":\"Â∑•Á®ãÂ∏à‰∏äÈó®ÊúçÂä°\"},{\"title\":\"È™åÊî∂ÂΩíÊ°£\",\"description\":\"ÂÆ¢Êà∑Á≠æÊî∂ÂΩíÊ°£\"}],\"active\":1,\"direction\":\"horizontal\"},\"_fc_id\":\"id_Fpbnmv3z6aqgabc\",\"name\":\"ref_Ftp3mv3z6aqgacc\",\"display\":true,\"hidden\":false,\"_fc_drag_tag\":\"page-steps\"},{\"type\":\"page-table\",\"field\":\"custTable1\",\"title\":\"ÂÆ¢Êà∑Ê°£Ê°à\",\"props\":{\"dataSourceId\":\"ds_cust\",\"columns\":[{\"prop\":\"Fyczmv3ks22dabc\",\"label\":\"ÂÆ¢Êà∑ÂêçÁß∞\"},{\"prop\":\"Ffxemv3ksch9aec_text\",\"label\":\"ÂÆ¢Êà∑Áä∂ÊÄÅ\"},{\"prop\":\"Fzgimv3kskiaahc\",\"label\":\"Ë¥üË¥£‰∫∫\"},{\"prop\":\"Fqgomv3ksnqrakc\",\"label\":\"ËÅîÁ≥ªÁîµËØù\"}],\"designMode\":true},\"_fc_id\":\"id_Fg1pmv3z6aqgadc\",\"name\":\"ref_Frixmv3z6aqgaec\",\"display\":true,\"hidden\":false,\"_fc_drag_tag\":\"page-table\"},{\"type\":\"page-detail\",\"field\":\"custDetail1\",\"title\":\"ÂÆ¢Êà∑Ê°£Ê°àËØ¶ÊÉÖ\",\"props\":{\"dataSourceId\":\"ds_cust\",\"title\":\"ÂÆ¢Êà∑Ê°£Ê°àËØ¶ÊÉÖÔºàÁÇπÂáª‰∏äÊñπÂàóË°®Ë°åËÅîÂä®Ôºâ\",\"columns\":[{\"key\":\"Fyczmv3ks22dabc\",\"label\":\"ÂÆ¢Êà∑ÂêçÁß∞\"},{\"key\":\"Ffxemv3ksch9aec_text\",\"label\":\"ÂÆ¢Êà∑Áä∂ÊÄÅ\"},{\"key\":\"Fzgimv3kskiaahc\",\"label\":\"Ë¥üË¥£‰∫∫\"},{\"key\":\"Fqgomv3ksnqrakc\",\"label\":\"ËÅîÁ≥ªÁîµËØù\"}]},\"_fc_id\":\"id_F5kkmv3z6aqgafc\",\"name\":\"ref_Fmm6mv3z6aqgagc\",\"display\":true,\"hidden\":false,\"_fc_drag_tag\":\"page-detail\"}],\"option\":{\"form\":{\"inline\":false,\"hideRequiredAsterisk\":false,\"labelPosition\":\"right\",\"size\":\"default\",\"labelWidth\":\"125px\"},\"resetBtn\":{\"show\":false,\"innerText\":\"ÈáçÁΩÆ\"},\"submitBtn\":{\"show\":true,\"innerText\":\"Êèê‰∫§\"}},\"dataSources\":[{\"id\":\"ds_cust\",\"refId\":\"a4187314fe3342c1ac5d6d52cc099a18\",\"name\":\"ÂÆ¢Êà∑Ê°£Ê°à-ÂÖ≥ËÅîÊºîÁ§∫\"}],\"actions\":[]}','PUBLISHED','default','PAGE','2026-10-11 15:30:48.729601',1),
('bbc2d83f6100453c92c6d239cc192e7d','2026-09-15 18:38:48.363138',NULL,NULL,NULL,'test_page','ÊµãËØïÈ°µÈù¢',1,'{\"rule\":[{\"type\":\"page-table\",\"field\":\"table1789468745852\",\"title\":\"\",\"props\":{\"dataSourceId\":\"ds_mu2jhb3n\",\"border\":true,\"stripe\":true,\"columns\":[{\"prop\":\"code\",\"label\":\"‰∫∫ÂëòÁºñÁ†Å\"},{\"prop\":\"name\",\"label\":\"‰∫∫ÂëòÂßìÂêç\"},{\"prop\":\"dept\",\"label\":\"ÊâÄÂ±ûÈÉ®Èó®\"}],\"sortable\":false,\"filterable\":false,\"pagination\":true,\"selectionMode\":\"none\",\"actionColumnWidth\":0,\"showSearch\":true,\"stretch\":true,\"searchFields\":[{\"key\":\"code\",\"label\":\"‰∫∫ÂëòÁºñÁ†Å\",\"matchType\":\"eq\"},{\"key\":\"name\",\"label\":\"‰∫∫ÂëòÂßìÂêç\",\"matchType\":\"eq\"},{\"key\":\"dept\",\"label\":\"ÊâÄÂ±ûÈÉ®Èó®\",\"matchType\":\"eq\"}],\"sortableFields\":[\"code\",\"name\"],\"pageSize\":20,\"pageSizes\":[10,20,50],\"viewActions\":{\"buttons\":[{\"key\":\"edit\",\"label\":\"ÁºñËæë\",\"placement\":\"column\",\"style\":\"icon\"},{\"key\":\"delete\",\"label\":\"Âà†Èô§\",\"placement\":\"column\",\"style\":\"icon\"},{\"key\":\"create\",\"label\":\"Êñ∞Â¢û\",\"placement\":\"toolbar\",\"style\":\"button\"},{\"key\":\"view\",\"label\":\"Êü•Áúã\",\"placement\":\"column\",\"style\":\"button\"}],\"permissions\":\"\"},\"viewDetail\":{\"width\":\"800px\",\"type\":\"form\",\"formMode\":\"drawer\"},\"viewEvents\":[],\"designMode\":true},\"_fc_id\":\"id_Fei8mu2jhl6kapc\",\"name\":\"ref_Fp3xmu2jhl6kaqc\",\"_fc_drag_tag\":\"page-table\",\"display\":true,\"hidden\":false},{\"type\":\"formContainer\",\"field\":\"F7n9mu2jn6reabc\",\"title\":\"Êï∞ÊçÆÂÆπÂô®\",\"info\":\"\",\"$required\":false,\"props\":{\"recordLocator\":{\"type\":\"current-record\"},\"displayMode\":\"dialog\",\"dialogWidth\":\"800px\",\"dialogHeight\":\"600px\",\"tabTitle\":\"ÁºñËæëËÆ∞ÂΩï\",\"inlineHeight\":\"auto\",\"showNewButton\":true,\"showCancelButton\":true,\"showConfirmButton\":true,\"showDeleteButton\":false,\"showCopyButton\":false,\"customButtons\":[],\"dataSourceId\":\"ds_mu2jhb3n\",\"rule\":[{\"type\":\"input\",\"field\":\"name\",\"title\":\"ÂßìÂêç\",\"info\":\"\",\"$required\":false,\"_fc_id\":\"id_Fi7lmu2jnbojafc\",\"name\":\"ref_F411mu2jnbojagc\",\"_fc_drag_tag\":\"input\",\"display\":true,\"hidden\":false}]},\"_fc_id\":\"id_Ffydmu2jn6reacc\",\"name\":\"ref_Fre6mu2jn6readc\",\"_fc_drag_tag\":\"formContainer\",\"display\":true,\"hidden\":false}],\"option\":{\"form\":{\"inline\":false,\"hideRequiredAsterisk\":false,\"labelPosition\":\"right\",\"size\":\"default\",\"labelWidth\":\"125px\"},\"resetBtn\":{\"show\":false,\"innerText\":\"ÈáçÁΩÆ\"},\"submitBtn\":{\"show\":true,\"innerText\":\"Êèê‰∫§\"}},\"dataSources\":[{\"id\":\"ds_mu2jhb3n\",\"refId\":\"20f476f047ca4386bfd1365ea5516832\",\"name\":\"ËØ∑ÂÅá‰∫∫Âëò Êï∞ÊçÆÊ∫ê\"}],\"actions\":[{\"trigger\":\"row-edit\",\"source\":\"ds_mu2jhb3n\",\"steps\":[{\"op\":\"open-container\",\"target\":\"ds_mu2jhb3n\",\"displayMode\":\"dialog\"}]}]}','PUBLISHED','default','PAGE','2026-09-15 19:15:14.720229',1),
('ccade5ed0f68e55315b0e0834867c436','2026-09-25 00:34:44.000000',NULL,NULL,NULL,'test1','ÊµãËØïÈ°µÈù¢',1,'{\"rule\":[{\"type\":\"page-table\",\"field\":\"table1790295600611\",\"title\":\"\",\"props\":{\"dataSourceId\":\"ds_mug7s41d\",\"border\":true,\"stripe\":true,\"columns\":[{\"prop\":\"apply_name\",\"label\":\"Áî≥ËØ∑‰∫∫ÂßìÂêç\"},{\"prop\":\"leave_end_date\",\"label\":\"ËØ∑ÂÅáÁªìÊùüÊó•Êúü\"},{\"prop\":\"leave_start_date\",\"label\":\"ËØ∑ÂÅáÂºÄÂßãÊó•Êúü\"},{\"prop\":\"leave_days\",\"label\":\"ËØ∑ÂÅáÂ§©Êï∞\"},{\"prop\":\"leave_type\",\"label\":\"ËØ∑ÂÅáÁ±ªÂûã\"},{\"prop\":\"person_name\",\"label\":\"ËØ∑ÂÅá‰∫∫ÂßìÂêç\"},{\"prop\":\"department\",\"label\":\"ÊâÄÂ±ûÈÉ®Èó®\"},{\"prop\":\"leave_reason\",\"label\":\"ËØ∑ÂÅá‰∫ãÁî±\"},{\"prop\":\"is_approved\",\"label\":\"ÊòØÂê¶Â∑≤Ëé∑Âæó‰∏ªÁÆ°ÊâπÂáÜ\"},{\"prop\":\"contact_phone\",\"label\":\"Á¥ßÊÄ•ËÅîÁ≥ªÁîµËØù\"},{\"prop\":\"position\",\"label\":\"ËÅå‰Ωç\"}],\"sortable\":false,\"filterable\":false,\"pagination\":true,\"selectionMode\":\"none\",\"actionColumnWidth\":0,\"showSearch\":true,\"stretch\":true,\"searchFields\":[],\"sortableFields\":[\"person_name\",\"department\",\"position\",\"leave_start_date\",\"leave_end_date\",\"leave_days\",\"contact_phone\",\"is_approved\",\"apply_name\"],\"pageSize\":20,\"pageSizes\":[10,20,50],\"viewActions\":{\"buttons\":[{\"key\":\"edit\",\"label\":\"ÁºñËæë\",\"placement\":\"column\",\"style\":\"icon\"},{\"key\":\"delete\",\"label\":\"Âà†Èô§\",\"placement\":\"column\",\"style\":\"icon\"}],\"permissions\":\"\"},\"viewDetail\":{\"width\":\"800px\",\"type\":\"form\"},\"viewEvents\":[],\"designMode\":true},\"_fc_id\":\"id_Fqfrmug7ryebabc\",\"name\":\"ref_Fos4mug7ryebacc\",\"_fc_drag_tag\":\"page-table\",\"display\":true,\"hidden\":false}],\"option\":{\"form\":{\"inline\":false,\"hideRequiredAsterisk\":false,\"labelPosition\":\"right\",\"size\":\"default\",\"labelWidth\":\"125px\"},\"resetBtn\":{\"show\":false,\"innerText\":\"ÈáçÁΩÆ\"},\"submitBtn\":{\"show\":true,\"innerText\":\"Êèê‰∫§\"}},\"dataSources\":[{\"id\":\"ds_mug7s41d\",\"refId\":\"e6741228ebda42fb8fa0c5717800d27a\",\"name\":\"ÊµãËØïË°®Âçï Êï∞ÊçÆÊ∫ê\"}],\"actions\":[]}','PUBLISHED','default','PAGE','2026-09-27 13:55:41.000000',1),
('f5d2e46500e74402831590ae8d310cd0','2026-10-03 01:29:54.144312',NULL,NULL,NULL,'dashboard','‰∏ªÈ°µ‰ª™Ë°®Áõò',1,'{\"rule\":[{\"type\":\"dash-kpi\",\"field\":\"kpiDefCount\",\"title\":\"ÊµÅÁ®ãÂÆö‰πâÊï∞\",\"col\":{\"span\":12},\"props\":{\"title\":\"ÊµÅÁ®ãÂÆö‰πâÊï∞\",\"subtitle\":\"Â∑≤ÈÉ®ÁΩ≤ÊµÅÁ®ãÂÆö‰πâ\",\"unit\":\"‰∏™\",\"agg\":\"count\",\"metric\":null,\"dataSourceId\":\"ds_def\",\"numberFormat\":\"\",\"trendEnabled\":false,\"trendGrain\":\"day\",\"trendField\":\"\",\"sparkline\":false,\"sparkRange\":12,\"span\":12,\"height\":\"140px\"}},{\"type\":\"dash-kpi\",\"field\":\"kpiRunning\",\"title\":\"ËøêË°å‰∏≠ÊµÅÁ®ã\",\"col\":{\"span\":12},\"props\":{\"title\":\"ËøêË°å‰∏≠ÊµÅÁ®ã\",\"subtitle\":\"ËøõË°å‰∏≠ÁöÑÊµÅÁ®ãÂÆû‰æã\",\"unit\":\"Êù°\",\"agg\":\"count\",\"metric\":null,\"dataSourceId\":\"ds_inst\",\"filter\":\"{\\\"conditions\\\": [{\\\"column\\\": \\\"status\\\", \\\"op\\\": \\\"eq\\\", \\\"value\\\": \\\"running\\\"}], \\\"logic\\\": \\\"AND\\\"}\",\"numberFormat\":\"\",\"trendEnabled\":false,\"trendGrain\":\"day\",\"trendField\":\"\",\"sparkline\":false,\"sparkRange\":12,\"span\":12,\"height\":\"140px\"}},{\"type\":\"dash-chart\",\"field\":\"chartTrend\",\"title\":\"ÂèëËµ∑Ë∂ãÂäø\",\"col\":{\"span\":12},\"props\":{\"title\":\"ÂèëËµ∑Ë∂ãÂäø\",\"chartType\":\"line\",\"group\":\"startTime\",\"timeGrain\":\"day\",\"agg\":\"count\",\"metric\":null,\"sort\":\"key\",\"order\":\"asc\",\"limit\":14,\"dataSourceId\":\"ds_inst\",\"height\":\"280px\",\"span\":12}},{\"type\":\"dash-chart\",\"field\":\"chartDist\",\"title\":\"ÊµÅÁ®ãÂàÜÂ∏É\",\"col\":{\"span\":12},\"props\":{\"title\":\"ÊµÅÁ®ãÂàÜÂ∏É\",\"chartType\":\"pie\",\"group\":\"processDefinitionName\",\"timeGrain\":null,\"agg\":\"count\",\"metric\":null,\"sort\":\"value\",\"order\":\"desc\",\"limit\":8,\"dataSourceId\":\"ds_inst\",\"height\":\"280px\",\"span\":12}}],\"option\":{\"form\":{\"inline\":false,\"hideRequiredAsterisk\":false,\"labelPosition\":\"top\",\"size\":\"default\",\"labelWidth\":\"auto\"}},\"dataSources\":[{\"id\":\"ds_def\",\"refId\":\"ds-builtin-process-definitions\",\"name\":\"ÊµÅÁ®ãÂÆö‰πâ\"},{\"id\":\"ds_inst\",\"refId\":\"ds-builtin-process-instances\",\"name\":\"ÊµÅÁ®ãÂÆû‰æã\"}],\"actions\":[]}','PUBLISHED','default','PAGE','2026-10-03 01:29:54.331685',1);
/*!40000 ALTER TABLE `wf_page_def` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_page_template`
--

DROP TABLE IF EXISTS `wf_page_template`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_page_template` (
  `id` varchar(64) NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `key` varchar(255) NOT NULL,
  `kind` varchar(20) NOT NULL,
  `name` varchar(255) NOT NULL,
  `schema` longtext DEFAULT NULL,
  `schema_version` int(11) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_page_template_tenant_key` (`tenant_id`,`key`),
  KEY `idx_page_template_tenant_updated` (`tenant_id`,`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_page_template`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_page_template` WRITE;
/*!40000 ALTER TABLE `wf_page_template` DISABLE KEYS */;
/*!40000 ALTER TABLE `wf_page_template` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_process_draft`
--

DROP TABLE IF EXISTS `wf_process_draft`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_process_draft` (
  `id` varchar(64) NOT NULL,
  `bpmn_xml` longtext NOT NULL,
  `category_id` varchar(64) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `deploy_id` varchar(64) DEFAULT NULL,
  `deployed_config_hash` varchar(64) DEFAULT NULL,
  `deployed_xml` longtext DEFAULT NULL,
  `process_key` varchar(255) NOT NULL,
  `last_deployed_at` datetime(6) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `process_definition_id` varchar(64) DEFAULT NULL,
  `status` varchar(32) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `version` int(11) NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tenant` (`tenant_id`),
  KEY `idx_wf_draft_key` (`tenant_id`,`process_key`),
  KEY `idx_category` (`category_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_process_draft`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_process_draft` WRITE;
/*!40000 ALTER TABLE `wf_process_draft` DISABLE KEYS */;
INSERT INTO `wf_process_draft` VALUES
('4e490b3fe5bb4616952d03bba14329a8','<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<bpmn:definitions xmlns:bpmn=\"http://www.omg.org/spec/BPMN/20100524/MODEL\"\n                  xmlns:flowable=\"http://flowable.org/bpmn\"\n                  xmlns:bpmndi=\"http://www.omg.org/spec/BPMN/20100524/DI\"\n                  xmlns:dc=\"http://www.omg.org/spec/DD/20100524/DC\"\n                  xmlns:di=\"http://www.omg.org/spec/DD/20100524/DI\"\n                  targetNamespace=\"http://workflow.local/demo\">\n  <bpmn:process id=\"leave_approval_demo\" name=\"ËØ∑ÂÅáÂÆ°Êâπ-ÈÄªËæëÊµÅÊºîÁ§∫\" isExecutable=\"true\">\n    <bpmn:startEvent id=\"start_1\" name=\"Êèê‰∫§ËØ∑ÂÅáÁî≥ËØ∑\" />\n    <bpmn:sequenceFlow id=\"flow_0\" sourceRef=\"start_1\" targetRef=\"apply_1\" />\n    <bpmn:userTask id=\"apply_1\" name=\"Êèê‰∫§ËØ∑ÂÅáÁî≥ËØ∑\" flowable:assignee=\"${initiator}\" />\n    <bpmn:sequenceFlow id=\"flow_1\" sourceRef=\"apply_1\" targetRef=\"approve_1\" />\n    <bpmn:userTask id=\"approve_1\" name=\"‰∏ªÁÆ°ÂÆ°Êâπ\" flowable:assignee=\"1\" />\n    <!-- assignee Áî® userIdÔºàÂπ≥Âè∞ÂæÖÂäûÊåâ user.id Êü•ËØ¢ÔºâÔºå1=adminÔºõÂèëËµ∑ËäÇÁÇπ apply_1 ‰∏∫Á¨¨‰∏Ä‰∏™ UserTaskÔºàÂêØÂä®Êó∂Ëá™Âä®ÂÆåÊàêÔºâ -->\n    <bpmn:sequenceFlow id=\"flow_2\" sourceRef=\"approve_1\" targetRef=\"end_1\" />\n    <bpmn:endEvent id=\"end_1\" name=\"ÂÆ°ÊâπÂÆåÊàê\" />\n  </bpmn:process>\n  <bpmndi:BPMNDiagram id=\"Diagram_1\">\n    <bpmndi:BPMNPlane id=\"Plane_1\" bpmnElement=\"leave_approval_demo\">\n      <bpmndi:BPMNShape id=\"start_1_di\" bpmnElement=\"start_1\">\n        <dc:Bounds x=\"160\" y=\"180\" width=\"36\" height=\"36\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"apply_1_di\" bpmnElement=\"apply_1\">\n        <dc:Bounds x=\"250\" y=\"158\" width=\"110\" height=\"80\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"approve_1_di\" bpmnElement=\"approve_1\">\n        <dc:Bounds x=\"430\" y=\"158\" width=\"110\" height=\"80\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"end_1_di\" bpmnElement=\"end_1\">\n        <dc:Bounds x=\"610\" y=\"180\" width=\"36\" height=\"36\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNEdge id=\"flow_0_di\" bpmnElement=\"flow_0\">\n        <di:waypoint x=\"196\" y=\"198\" />\n        <di:waypoint x=\"250\" y=\"198\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"flow_1_di\" bpmnElement=\"flow_1\">\n        <di:waypoint x=\"360\" y=\"198\" />\n        <di:waypoint x=\"430\" y=\"198\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"flow_2_di\" bpmnElement=\"flow_2\">\n        <di:waypoint x=\"540\" y=\"198\" />\n        <di:waypoint x=\"610\" y=\"198\" />\n      </bpmndi:BPMNEdge>\n    </bpmndi:BPMNPlane>\n  </bpmndi:BPMNDiagram>\n</bpmn:definitions>\n',NULL,'2026-10-11 16:21:55.434514',NULL,'e00400f7-c58f-11f1-92ce-b6a8b1076472','605f02568337561a5e1c0608b1099120d80d969207204cb8513be88384853d2c','<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<bpmn:definitions xmlns:bpmn=\"http://www.omg.org/spec/BPMN/20100524/MODEL\"\n                  xmlns:flowable=\"http://flowable.org/bpmn\"\n                  xmlns:bpmndi=\"http://www.omg.org/spec/BPMN/20100524/DI\"\n                  xmlns:dc=\"http://www.omg.org/spec/DD/20100524/DC\"\n                  xmlns:di=\"http://www.omg.org/spec/DD/20100524/DI\"\n                  targetNamespace=\"http://workflow.local/demo\">\n  <bpmn:process id=\"leave_approval_demo\" name=\"ËØ∑ÂÅáÂÆ°Êâπ-ÈÄªËæëÊµÅÊºîÁ§∫\" isExecutable=\"true\">\n    <bpmn:startEvent id=\"start_1\" name=\"Êèê‰∫§ËØ∑ÂÅáÁî≥ËØ∑\" />\n    <bpmn:sequenceFlow id=\"flow_0\" sourceRef=\"start_1\" targetRef=\"apply_1\" />\n    <bpmn:userTask id=\"apply_1\" name=\"Êèê‰∫§ËØ∑ÂÅáÁî≥ËØ∑\" flowable:assignee=\"${initiator}\" />\n    <bpmn:sequenceFlow id=\"flow_1\" sourceRef=\"apply_1\" targetRef=\"approve_1\" />\n    <bpmn:userTask id=\"approve_1\" name=\"‰∏ªÁÆ°ÂÆ°Êâπ\" flowable:assignee=\"1\" />\n    <!-- assignee Áî® userIdÔºàÂπ≥Âè∞ÂæÖÂäûÊåâ user.id Êü•ËØ¢ÔºâÔºå1=adminÔºõÂèëËµ∑ËäÇÁÇπ apply_1 ‰∏∫Á¨¨‰∏Ä‰∏™ UserTaskÔºàÂêØÂä®Êó∂Ëá™Âä®ÂÆåÊàêÔºâ -->\n    <bpmn:sequenceFlow id=\"flow_2\" sourceRef=\"approve_1\" targetRef=\"end_1\" />\n    <bpmn:endEvent id=\"end_1\" name=\"ÂÆ°ÊâπÂÆåÊàê\" />\n  </bpmn:process>\n  <bpmndi:BPMNDiagram id=\"Diagram_1\">\n    <bpmndi:BPMNPlane id=\"Plane_1\" bpmnElement=\"leave_approval_demo\">\n      <bpmndi:BPMNShape id=\"start_1_di\" bpmnElement=\"start_1\">\n        <dc:Bounds x=\"160\" y=\"180\" width=\"36\" height=\"36\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"apply_1_di\" bpmnElement=\"apply_1\">\n        <dc:Bounds x=\"250\" y=\"158\" width=\"110\" height=\"80\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"approve_1_di\" bpmnElement=\"approve_1\">\n        <dc:Bounds x=\"430\" y=\"158\" width=\"110\" height=\"80\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"end_1_di\" bpmnElement=\"end_1\">\n        <dc:Bounds x=\"610\" y=\"180\" width=\"36\" height=\"36\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNEdge id=\"flow_0_di\" bpmnElement=\"flow_0\">\n        <di:waypoint x=\"196\" y=\"198\" />\n        <di:waypoint x=\"250\" y=\"198\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"flow_1_di\" bpmnElement=\"flow_1\">\n        <di:waypoint x=\"360\" y=\"198\" />\n        <di:waypoint x=\"430\" y=\"198\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"flow_2_di\" bpmnElement=\"flow_2\">\n        <di:waypoint x=\"540\" y=\"198\" />\n        <di:waypoint x=\"610\" y=\"198\" />\n      </bpmndi:BPMNEdge>\n    </bpmndi:BPMNPlane>\n  </bpmndi:BPMNDiagram>\n</bpmn:definitions>\n','leave_approval_demo','2026-10-11 16:21:55.524978','ËØ∑ÂÅáÂÆ°Êâπ-ÈÄªËæëÊµÅÊºîÁ§∫','leave_approval_demo:9:e00dec0a-c58f-11f1-92ce-b6a8b1076472','DEPLOYED','default','2026-10-11 16:21:55.527198',9,NULL),
('4f10a0d7bf698bca3eeae99dd132d5a1','<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<bpmn:definitions xmlns:bpmn=\"http://www.omg.org/spec/BPMN/20100524/MODEL\" xmlns:bpmndi=\"http://www.omg.org/spec/BPMN/20100524/DI\" xmlns:dc=\"http://www.omg.org/spec/DD/20100524/DC\" xmlns:di=\"http://www.omg.org/spec/DD/20100524/DI\" xmlns:flowable=\"http://flowable.org/bpmn\" targetNamespace=\"64f4802b34e352e3da0d7aeb9fa71de2\">\n  <bpmn:process id=\"leave\" name=\"ËØ∑ÂÅá\" isExecutable=\"true\">\n    <bpmn:startEvent id=\"startEvent_1\"/>\n  </bpmn:process>\n  <bpmndi:BPMNDiagram id=\"BPMNDiagram_1\">\n    <bpmndi:BPMNPlane id=\"BPMNPlane_1\" bpmnElement=\"leave\">\n      <bpmndi:BPMNShape id=\"startEvent_1_di\" bpmnElement=\"startEvent_1\">\n        <dc:Rect x=\"160\" y=\"160\" width=\"36\" height=\"36\"/>\n      </bpmndi:BPMNShape>\n    </bpmndi:BPMNPlane>\n  </bpmndi:BPMNDiagram>\n</bpmn:definitions>','64f4802b34e352e3da0d7aeb9fa71de2','2026-09-27 21:54:59.000000',NULL,NULL,NULL,NULL,'leave',NULL,'ËØ∑ÂÅá',NULL,'DRAFT','default','2026-09-27 21:54:59.000000',0,NULL),
('be9204eac01647d69c2ed9423173b698','<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<bpmn:definitions xmlns:bpmn=\"http://www.omg.org/spec/BPMN/20100524/MODEL\" xmlns:bpmndi=\"http://www.omg.org/spec/BPMN/20100524/DI\" xmlns:dc=\"http://www.omg.org/spec/DD/20100524/DC\" xmlns:di=\"http://www.omg.org/spec/DD/20100524/DI\" xmlns:wf=\"http://workflow.com/schema/bpmn/wf\" xmlns:flowable=\"http://flowable.org/bpmn\" targetNamespace=\"abbde8e4a6f74009a8a595bb7c38973c\">\n  <bpmn:process id=\"leave_apply\" name=\"ËØ∑ÂÅáÊµÅÁ®ã\" isExecutable=\"true\">\n    <bpmn:startEvent id=\"Event_1c3exx9\">\n      <bpmn:outgoing>Flow_18tdmgw</bpmn:outgoing>\n    </bpmn:startEvent>\n    <bpmn:userTask id=\"Activity_1dd4ed3\" name=\"ÂèëËµ∑ËäÇÁÇπ\" wf:nodeRole=\"initiator\" flowable:assignee=\"${initiator}\">\n      <bpmn:incoming>Flow_18tdmgw</bpmn:incoming>\n      <bpmn:outgoing>Flow_1h1y4wd</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_18tdmgw\" sourceRef=\"Event_1c3exx9\" targetRef=\"Activity_1dd4ed3\" />\n    <bpmn:userTask id=\"Activity_0lwswse\" name=\"Â§ö‰∫∫ÂÆ°Êâπ\">\n      <bpmn:incoming>Flow_1h1y4wd</bpmn:incoming>\n      <bpmn:outgoing>Flow_0cbe119</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_1h1y4wd\" sourceRef=\"Activity_1dd4ed3\" targetRef=\"Activity_0lwswse\" />\n    <bpmn:userTask id=\"Activity_1tsdpa6\" name=\"ÂéªÈáçÂÆ°Êâπ\">\n      <bpmn:incoming>Flow_0cbe119</bpmn:incoming>\n      <bpmn:outgoing>Flow_1cusaqg</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_0cbe119\" sourceRef=\"Activity_0lwswse\" targetRef=\"Activity_1tsdpa6\" />\n    <bpmn:userTask id=\"Activity_0rrplp3\" name=\"Â§öË°®Âçï\">\n      <bpmn:incoming>Flow_1cusaqg</bpmn:incoming>\n      <bpmn:outgoing>Flow_0xzyx7i</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_1cusaqg\" sourceRef=\"Activity_1tsdpa6\" targetRef=\"Activity_0rrplp3\" />\n    <bpmn:endEvent id=\"Event_0ua71tz\">\n      <bpmn:incoming>Flow_0xzyx7i</bpmn:incoming>\n    </bpmn:endEvent>\n    <bpmn:sequenceFlow id=\"Flow_0xzyx7i\" sourceRef=\"Activity_0rrplp3\" targetRef=\"Event_0ua71tz\" />\n  </bpmn:process>\n  <bpmndi:BPMNDiagram id=\"BPMNDiagram_1\">\n    <bpmndi:BPMNPlane id=\"BPMNPlane_1\" bpmnElement=\"leave_apply\">\n      <bpmndi:BPMNShape id=\"Event_1c3exx9_di\" bpmnElement=\"Event_1c3exx9\">\n        <dc:Bounds x=\"127\" y=\"285\" width=\"36\" height=\"36\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_1dd4ed3_di\" bpmnElement=\"Activity_1dd4ed3\">\n        <dc:Bounds x=\"220\" y=\"263\" width=\"100\" height=\"80\" />\n        <bpmndi:BPMNLabel />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_0lwswse_di\" bpmnElement=\"Activity_0lwswse\">\n        <dc:Bounds x=\"380\" y=\"263\" width=\"100\" height=\"80\" />\n        <bpmndi:BPMNLabel />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_1tsdpa6_di\" bpmnElement=\"Activity_1tsdpa6\">\n        <dc:Bounds x=\"540\" y=\"263\" width=\"100\" height=\"80\" />\n        <bpmndi:BPMNLabel />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_0rrplp3_di\" bpmnElement=\"Activity_0rrplp3\">\n        <dc:Bounds x=\"690\" y=\"263\" width=\"100\" height=\"80\" />\n        <bpmndi:BPMNLabel />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Event_0ua71tz_di\" bpmnElement=\"Event_0ua71tz\">\n        <dc:Bounds x=\"842\" y=\"285\" width=\"36\" height=\"36\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNEdge id=\"Flow_18tdmgw_di\" bpmnElement=\"Flow_18tdmgw\">\n        <di:waypoint x=\"163\" y=\"303\" />\n        <di:waypoint x=\"220\" y=\"303\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_1h1y4wd_di\" bpmnElement=\"Flow_1h1y4wd\">\n        <di:waypoint x=\"320\" y=\"303\" />\n        <di:waypoint x=\"380\" y=\"303\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_0cbe119_di\" bpmnElement=\"Flow_0cbe119\">\n        <di:waypoint x=\"480\" y=\"303\" />\n        <di:waypoint x=\"540\" y=\"303\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_1cusaqg_di\" bpmnElement=\"Flow_1cusaqg\">\n        <di:waypoint x=\"640\" y=\"303\" />\n        <di:waypoint x=\"690\" y=\"303\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_0xzyx7i_di\" bpmnElement=\"Flow_0xzyx7i\">\n        <di:waypoint x=\"790\" y=\"303\" />\n        <di:waypoint x=\"842\" y=\"303\" />\n      </bpmndi:BPMNEdge>\n    </bpmndi:BPMNPlane>\n  </bpmndi:BPMNDiagram>\n</bpmn:definitions>\n','abbde8e4a6f74009a8a595bb7c38973c','2026-09-11 10:39:53.500261',NULL,NULL,NULL,NULL,'leave_apply',NULL,'ËØ∑ÂÅáÊµÅÁ®ã',NULL,'DRAFT','default','2026-09-11 10:48:10.689698',0,NULL),
('f50d6d7a012aea6df8710a35de24b267','<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<bpmn:definitions xmlns:bpmn=\"http://www.omg.org/spec/BPMN/20100524/MODEL\" xmlns:bpmndi=\"http://www.omg.org/spec/BPMN/20100524/DI\" xmlns:dc=\"http://www.omg.org/spec/DD/20100524/DC\" xmlns:di=\"http://www.omg.org/spec/DD/20100524/DI\" xmlns:wf=\"http://workflow.com/schema/bpmn/wf\" xmlns:flowable=\"http://flowable.org/bpmn\" targetNamespace=\"http://flowable.org/bpmn\">\n  <bpmn:process id=\"ui_verify_flow\" name=\"UIÈ™åËØÅÊµÅÁ®ã\" isExecutable=\"true\">\n    <bpmn:startEvent id=\"startEvent_1\">\n      <bpmn:outgoing>Flow_10bijim</bpmn:outgoing>\n    </bpmn:startEvent>\n    <bpmn:userTask id=\"Activity_0q13unc\" name=\"ÂèëËµ∑ËäÇÁÇπ\" wf:nodeRole=\"initiator\" flowable:assignee=\"${initiator}\">\n      <bpmn:incoming>Flow_10bijim</bpmn:incoming>\n      <bpmn:outgoing>Flow_1mkegyr</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_10bijim\" sourceRef=\"startEvent_1\" targetRef=\"Activity_0q13unc\" />\n    <bpmn:userTask id=\"Activity_0np59ha\" wf:nodeRole=\"handler\">\n      <bpmn:incoming>Flow_1mkegyr</bpmn:incoming>\n      <bpmn:outgoing>Flow_1avyfx2</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_1mkegyr\" sourceRef=\"Activity_0q13unc\" targetRef=\"Activity_0np59ha\" />\n    <bpmn:userTask id=\"Activity_023htgs\" wf:nodeRole=\"handler\">\n      <bpmn:incoming>Flow_1avyfx2</bpmn:incoming>\n      <bpmn:outgoing>Flow_04920vf</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_1avyfx2\" sourceRef=\"Activity_0np59ha\" targetRef=\"Activity_023htgs\" />\n    <bpmn:userTask id=\"Activity_0wemnzz\" wf:nodeRole=\"approver\">\n      <bpmn:incoming>Flow_04920vf</bpmn:incoming>\n      <bpmn:outgoing>Flow_1bblzfz</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_04920vf\" sourceRef=\"Activity_023htgs\" targetRef=\"Activity_0wemnzz\" />\n    <bpmn:endEvent id=\"Event_04ffjpj\">\n      <bpmn:incoming>Flow_1bblzfz</bpmn:incoming>\n    </bpmn:endEvent>\n    <bpmn:sequenceFlow id=\"Flow_1bblzfz\" sourceRef=\"Activity_0wemnzz\" targetRef=\"Event_04ffjpj\" />\n  </bpmn:process>\n  <bpmndi:BPMNDiagram id=\"BPMNDiagram_1\">\n    <bpmndi:BPMNPlane id=\"BPMNPlane_1\" bpmnElement=\"ui_verify_flow\">\n      <bpmndi:BPMNShape id=\"startEvent_1_di\" bpmnElement=\"startEvent_1\">\n        <dc:Bounds x=\"160\" y=\"160\" width=\"36\" height=\"36\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_0q13unc_di\" bpmnElement=\"Activity_0q13unc\">\n        <dc:Bounds x=\"250\" y=\"138\" width=\"100\" height=\"80\" />\n        <bpmndi:BPMNLabel />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_0np59ha_di\" bpmnElement=\"Activity_0np59ha\">\n        <dc:Bounds x=\"410\" y=\"138\" width=\"100\" height=\"80\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_023htgs_di\" bpmnElement=\"Activity_023htgs\">\n        <dc:Bounds x=\"570\" y=\"138\" width=\"100\" height=\"80\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_0wemnzz_di\" bpmnElement=\"Activity_0wemnzz\">\n        <dc:Bounds x=\"730\" y=\"138\" width=\"100\" height=\"80\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Event_04ffjpj_di\" bpmnElement=\"Event_04ffjpj\">\n        <dc:Bounds x=\"892\" y=\"160\" width=\"36\" height=\"36\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNEdge id=\"Flow_10bijim_di\" bpmnElement=\"Flow_10bijim\">\n        <di:waypoint x=\"196\" y=\"178\" />\n        <di:waypoint x=\"250\" y=\"178\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_1mkegyr_di\" bpmnElement=\"Flow_1mkegyr\">\n        <di:waypoint x=\"350\" y=\"178\" />\n        <di:waypoint x=\"410\" y=\"178\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_1avyfx2_di\" bpmnElement=\"Flow_1avyfx2\">\n        <di:waypoint x=\"510\" y=\"178\" />\n        <di:waypoint x=\"570\" y=\"178\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_04920vf_di\" bpmnElement=\"Flow_04920vf\">\n        <di:waypoint x=\"670\" y=\"178\" />\n        <di:waypoint x=\"730\" y=\"178\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_1bblzfz_di\" bpmnElement=\"Flow_1bblzfz\">\n        <di:waypoint x=\"830\" y=\"178\" />\n        <di:waypoint x=\"892\" y=\"178\" />\n      </bpmndi:BPMNEdge>\n    </bpmndi:BPMNPlane>\n  </bpmndi:BPMNDiagram>\n</bpmn:definitions>\n',NULL,'2026-09-30 01:18:47.000000',NULL,'ebeedebc-a08a-a49e-b50b-d75ef7811064','041b3974db57dece93836aedb001faf160851101f5364cecf304c70fedb108fd','<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<bpmn:definitions xmlns:bpmn=\"http://www.omg.org/spec/BPMN/20100524/MODEL\" xmlns:bpmndi=\"http://www.omg.org/spec/BPMN/20100524/DI\" xmlns:dc=\"http://www.omg.org/spec/DD/20100524/DC\" xmlns:di=\"http://www.omg.org/spec/DD/20100524/DI\" xmlns:wf=\"http://workflow.com/schema/bpmn/wf\" xmlns:flowable=\"http://flowable.org/bpmn\" targetNamespace=\"http://flowable.org/bpmn\">\n  <bpmn:process id=\"ui_verify_flow\" name=\"UIÈ™åËØÅÊµÅÁ®ã\" isExecutable=\"true\">\n    <bpmn:startEvent id=\"startEvent_1\">\n      <bpmn:outgoing>Flow_10bijim</bpmn:outgoing>\n    </bpmn:startEvent>\n    <bpmn:userTask id=\"Activity_0q13unc\" name=\"ÂèëËµ∑ËäÇÁÇπ\" wf:nodeRole=\"initiator\" flowable:assignee=\"${initiator}\">\n      <bpmn:incoming>Flow_10bijim</bpmn:incoming>\n      <bpmn:outgoing>Flow_1mkegyr</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_10bijim\" sourceRef=\"startEvent_1\" targetRef=\"Activity_0q13unc\" />\n    <bpmn:userTask id=\"Activity_0np59ha\" wf:nodeRole=\"handler\">\n      <bpmn:incoming>Flow_1mkegyr</bpmn:incoming>\n      <bpmn:outgoing>Flow_1avyfx2</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_1mkegyr\" sourceRef=\"Activity_0q13unc\" targetRef=\"Activity_0np59ha\" />\n    <bpmn:userTask id=\"Activity_023htgs\" wf:nodeRole=\"handler\">\n      <bpmn:incoming>Flow_1avyfx2</bpmn:incoming>\n      <bpmn:outgoing>Flow_04920vf</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_1avyfx2\" sourceRef=\"Activity_0np59ha\" targetRef=\"Activity_023htgs\" />\n    <bpmn:userTask id=\"Activity_0wemnzz\" wf:nodeRole=\"approver\">\n      <bpmn:incoming>Flow_04920vf</bpmn:incoming>\n      <bpmn:outgoing>Flow_1bblzfz</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_04920vf\" sourceRef=\"Activity_023htgs\" targetRef=\"Activity_0wemnzz\" />\n    <bpmn:endEvent id=\"Event_04ffjpj\">\n      <bpmn:incoming>Flow_1bblzfz</bpmn:incoming>\n    </bpmn:endEvent>\n    <bpmn:sequenceFlow id=\"Flow_1bblzfz\" sourceRef=\"Activity_0wemnzz\" targetRef=\"Event_04ffjpj\" />\n  </bpmn:process>\n  <bpmndi:BPMNDiagram id=\"BPMNDiagram_1\">\n    <bpmndi:BPMNPlane id=\"BPMNPlane_1\" bpmnElement=\"ui_verify_flow\">\n      <bpmndi:BPMNShape id=\"startEvent_1_di\" bpmnElement=\"startEvent_1\">\n        <dc:Bounds x=\"160\" y=\"160\" width=\"36\" height=\"36\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_0q13unc_di\" bpmnElement=\"Activity_0q13unc\">\n        <dc:Bounds x=\"250\" y=\"138\" width=\"100\" height=\"80\" />\n        <bpmndi:BPMNLabel />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_0np59ha_di\" bpmnElement=\"Activity_0np59ha\">\n        <dc:Bounds x=\"410\" y=\"138\" width=\"100\" height=\"80\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_023htgs_di\" bpmnElement=\"Activity_023htgs\">\n        <dc:Bounds x=\"570\" y=\"138\" width=\"100\" height=\"80\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_0wemnzz_di\" bpmnElement=\"Activity_0wemnzz\">\n        <dc:Bounds x=\"730\" y=\"138\" width=\"100\" height=\"80\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Event_04ffjpj_di\" bpmnElement=\"Event_04ffjpj\">\n        <dc:Bounds x=\"892\" y=\"160\" width=\"36\" height=\"36\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNEdge id=\"Flow_10bijim_di\" bpmnElement=\"Flow_10bijim\">\n        <di:waypoint x=\"196\" y=\"178\" />\n        <di:waypoint x=\"250\" y=\"178\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_1mkegyr_di\" bpmnElement=\"Flow_1mkegyr\">\n        <di:waypoint x=\"350\" y=\"178\" />\n        <di:waypoint x=\"410\" y=\"178\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_1avyfx2_di\" bpmnElement=\"Flow_1avyfx2\">\n        <di:waypoint x=\"510\" y=\"178\" />\n        <di:waypoint x=\"570\" y=\"178\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_04920vf_di\" bpmnElement=\"Flow_04920vf\">\n        <di:waypoint x=\"670\" y=\"178\" />\n        <di:waypoint x=\"730\" y=\"178\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_1bblzfz_di\" bpmnElement=\"Flow_1bblzfz\">\n        <di:waypoint x=\"830\" y=\"178\" />\n        <di:waypoint x=\"892\" y=\"178\" />\n      </bpmndi:BPMNEdge>\n    </bpmndi:BPMNPlane>\n  </bpmndi:BPMNDiagram>\n</bpmn:definitions>\n','ui_verify_flow','2026-09-30 02:06:19.000000','UIÈ™åËØÅÊµÅÁ®ã','ui_verify_flow:1:1f4f614e-f2a4-6e5f-3ee6-59d5fccd12a4','DEPLOYED','default','2026-09-30 02:06:19.000000',1,NULL);
/*!40000 ALTER TABLE `wf_process_draft` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_row_permission`
--

DROP TABLE IF EXISTS `wf_row_permission`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_row_permission` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `is_deleted` int(11) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `conditions_json` text NOT NULL,
  `name` varchar(100) NOT NULL,
  `remark` varchar(255) DEFAULT NULL,
  `tenant_id` varchar(64) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_row_permission`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_row_permission` WRITE;
/*!40000 ALTER TABLE `wf_row_permission` DISABLE KEYS */;
/*!40000 ALTER TABLE `wf_row_permission` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_row_permission_grant`
--

DROP TABLE IF EXISTS `wf_row_permission_grant`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_row_permission_grant` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `is_deleted` int(11) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `permission_id` bigint(20) NOT NULL,
  `subject_key` varchar(64) NOT NULL,
  `subject_type` enum('ROLE') NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_row_permission_grant` (`permission_id`,`subject_type`,`subject_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_row_permission_grant`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_row_permission_grant` WRITE;
/*!40000 ALTER TABLE `wf_row_permission_grant` DISABLE KEYS */;
/*!40000 ALTER TABLE `wf_row_permission_grant` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_row_permission_source`
--

DROP TABLE IF EXISTS `wf_row_permission_source`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_row_permission_source` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `is_deleted` int(11) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `data_source_id` varchar(64) NOT NULL,
  `permission_id` bigint(20) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_row_permission_source` (`permission_id`,`data_source_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_row_permission_source`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_row_permission_source` WRITE;
/*!40000 ALTER TABLE `wf_row_permission_source` DISABLE KEYS */;
/*!40000 ALTER TABLE `wf_row_permission_source` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_row_scope_exemption`
--

DROP TABLE IF EXISTS `wf_row_scope_exemption`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_row_scope_exemption` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `is_deleted` int(11) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `data_source_id` varchar(64) NOT NULL,
  `reason` varchar(500) NOT NULL,
  `revoked_at` datetime(6) DEFAULT NULL,
  `revoked_by` varchar(50) DEFAULT NULL,
  `tenant_id` varchar(64) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_row_scope_exemption_ds` (`tenant_id`,`data_source_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_row_scope_exemption`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_row_scope_exemption` WRITE;
/*!40000 ALTER TABLE `wf_row_scope_exemption` DISABLE KEYS */;
/*!40000 ALTER TABLE `wf_row_scope_exemption` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_serial_number`
--

DROP TABLE IF EXISTS `wf_serial_number`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_serial_number` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(64) NOT NULL COMMENT 'ÁßüÊà∑ id',
  `serial_key` varchar(128) NOT NULL COMMENT 'Â∫èÂàóÊ†áËØÜÔºàformKey.fieldKeyÔºåÈò≤Ë∑®Ë°®ÂçïÈáçÂè∑Ôºâ',
  `period` varchar(16) NOT NULL COMMENT 'ÈáçÁΩÆÂë®ÊúüÈîÆÔºàday=yyyyMMdd/month=yyyyMM/year=yyyy/never=ALLÔºâ',
  `seq` bigint(20) NOT NULL DEFAULT 0 COMMENT 'ÂΩìÂâçÊµÅÊ∞¥Âè∑Ôºàupsert Ëá™Â¢ûÔºâ',
  `updated_at` datetime DEFAULT NULL COMMENT 'ÊúÄËøëÂèñÂè∑Êó∂Èó¥',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_serial` (`tenant_id`,`serial_key`,`period`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Ëá™Âä®ÁºñÂè∑ÊµÅÊ∞¥Âè∑ËÆ°Êï∞ÔºàTask 3-dÔºâ';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_serial_number`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_serial_number` WRITE;
/*!40000 ALTER TABLE `wf_serial_number` DISABLE KEYS */;
INSERT INTO `wf_serial_number` VALUES
(1,'default','onsite_service_demo.orderNo','20261011',3,'2026-10-11 14:41:43');
/*!40000 ALTER TABLE `wf_serial_number` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_task_comment`
--

DROP TABLE IF EXISTS `wf_task_comment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_task_comment` (
  `id` varchar(64) NOT NULL,
  `action` varchar(32) NOT NULL,
  `comment` text DEFAULT NULL,
  `signature` longtext DEFAULT NULL COMMENT 'ÊâãÂÜôÁ≠æÂêç dataURLÔºàsignature.enabled ËäÇÁÇπÊèê‰∫§Êó∂Â≠òÂÇ®Ôºåaction=approveÔºâ',
  `created_at` datetime(6) DEFAULT NULL,
  `process_instance_id` varchar(64) NOT NULL,
  `target_user_id` varchar(64) DEFAULT NULL,
  `task_id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_comment_task` (`tenant_id`,`task_id`),
  KEY `idx_comment_instance` (`tenant_id`,`process_instance_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_task_comment`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_task_comment` WRITE;
/*!40000 ALTER TABLE `wf_task_comment` DISABLE KEYS */;
/*!40000 ALTER TABLE `wf_task_comment` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_task_remind`
--

DROP TABLE IF EXISTS `wf_task_remind`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_task_remind` (
  `id` varchar(64) NOT NULL,
  `process_instance_id` varchar(64) NOT NULL,
  `remind_from` varchar(64) NOT NULL,
  `remind_time` datetime(6) DEFAULT NULL,
  `remind_to` varchar(64) NOT NULL,
  `task_id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_remind_task` (`tenant_id`,`task_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_task_remind`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_task_remind` WRITE;
/*!40000 ALTER TABLE `wf_task_remind` DISABLE KEYS */;
/*!40000 ALTER TABLE `wf_task_remind` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_task_transfer`
--

DROP TABLE IF EXISTS `wf_task_transfer`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_task_transfer` (
  `id` varchar(64) NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `from_user` varchar(64) NOT NULL,
  `process_instance_id` varchar(64) NOT NULL,
  `reason` varchar(500) DEFAULT NULL,
  `task_id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `to_user` varchar(64) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_transfer_task` (`tenant_id`,`task_id`),
  KEY `idx_transfer_instance` (`tenant_id`,`process_instance_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_task_transfer`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_task_transfer` WRITE;
/*!40000 ALTER TABLE `wf_task_transfer` DISABLE KEYS */;
/*!40000 ALTER TABLE `wf_task_transfer` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*M!100616 SET NOTE_VERBOSITY=@OLD_NOTE_VERBOSITY */;

-- Dump completed on 2026-10-28 14:10:26
